import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createSupabaseClient } from "../_core/supabase";
import { router, supabaseProtectedProcedure } from "../_core/trpc";
import { requireSupabaseTenantPermission } from "../supabaseTenantAccess";
import { parseWorkspaceQuoteDraft, parseWorkspaceQuotePreparation, parseWorkspaceQuoteRequestHistory, parseWorkspaceQuoteRequestList } from "./supabaseQuoteRequestContract";
import { parseWorkspaceGenerateQuote } from "./supabaseQuoteContract";

const status = z.enum(["new", "in_analysis", "awaiting_information", "in_quoting", "ready", "sent", "approved", "rejected", "expired", "cancelled"]);
const tenantInput = z.object({ tenantId: z.number().int().positive() });

function clientFor(user: { accessToken: string } | null) {
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Autenticação Supabase obrigatória." });
  return createSupabaseClient(user.accessToken);
}

function databaseError(error: { code?: string | null; message?: string | null } | null) {
  if (error?.code === "42501") return new TRPCError({ code: "FORBIDDEN", message: error.message ?? "Seu perfil não possui acesso à fila comercial desta oficina." });
  if (error?.code === "22023") return new TRPCError({ code: "BAD_REQUEST", message: error.message ?? "Dados inválidos." });
  if (error?.code === "P0002") return new TRPCError({ code: "NOT_FOUND", message: error.message ?? "Solicitação não encontrada nesta oficina." });
  if (error?.code === "P0001") return new TRPCError({ code: "CONFLICT", message: error.message ?? "Esta solicitação já possui um orçamento criado." });
  return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível concluir esta operação no banco Supabase." });
}

export const supabaseQuoteRequestRouter = router({
  list: supabaseProtectedProcedure.input(tenantInput.extend({ status: status.optional(), statuses: z.array(status).min(1).optional(), search: z.string().trim().max(120).optional(), page: z.number().int().min(1).default(1), pageSize: z.number().int().min(1).max(100).default(25) })).query(async ({ ctx, input }) => {
    await requireSupabaseTenantPermission(ctx.supabaseUser!, input.tenantId, "quotes.manage");
    const targetStatuses = input.statuses ?? (input.status ? [input.status] : null);
    const { data, error } = await clientFor(ctx.supabaseUser).rpc("workspace_list_quote_requests", { target_tenant_id: input.tenantId, target_statuses: targetStatuses, search_input: input.search ?? null, page_input: input.page, page_size_input: input.pageSize });
    if (error || !data) throw databaseError(error);
    const result = parseWorkspaceQuoteRequestList(data);
    if (!result.success) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "A fila comercial recebeu dados em formato inválido." });
    return { ...result.data, items: result.data.items.slice(0, input.pageSize) };
  }),

  assignees: supabaseProtectedProcedure.input(tenantInput).query(async ({ ctx, input }) => {
    await requireSupabaseTenantPermission(ctx.supabaseUser!, input.tenantId, "quotes.manage");
    const { data, error } = await clientFor(ctx.supabaseUser).rpc("workspace_quote_request_assignees", { target_tenant_id: input.tenantId });
    if (error) throw databaseError(error);
    return (data ?? []) as Array<{ id: string; name: string; role: string }>;
  }),

  history: supabaseProtectedProcedure.input(tenantInput.extend({ quoteRequestId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    await requireSupabaseTenantPermission(ctx.supabaseUser!, input.tenantId, "quotes.manage");
    const { data, error } = await clientFor(ctx.supabaseUser).rpc("workspace_quote_request_history", { target_tenant_id: input.tenantId, target_request_id: input.quoteRequestId });
    if (error) throw databaseError(error);
    const result = parseWorkspaceQuoteRequestHistory(data ?? []);
    if (!result.success) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "O histórico da solicitação recebeu dados em formato inválido." });
    return result.data;
  }),

  prepare: supabaseProtectedProcedure.input(tenantInput.extend({ quoteRequestId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    await requireSupabaseTenantPermission(ctx.supabaseUser!, input.tenantId, "quotes.manage");
    const { data, error } = await clientFor(ctx.supabaseUser).rpc("workspace_prepare_quote_from_request", { target_tenant_id: input.tenantId, target_request_id: input.quoteRequestId });
    if (error || !data) throw databaseError(error);
    const result = parseWorkspaceQuotePreparation(data);
    if (!result.success) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "A preparação do orçamento recebeu dados em formato inválido." });
    if (result.data.request.tenantId !== input.tenantId || result.data.request.id !== input.quoteRequestId) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "A preparação do orçamento retornou uma solicitação incompatível." });
    }
    return result.data;
  }),

  createDraft: supabaseProtectedProcedure.input(tenantInput.extend({
    quoteRequestId: z.number().int().positive(),
    notes: z.string().trim().max(4000).optional(),
    terms: z.string().trim().max(4000).optional(),
    validUntil: z.string().datetime({ offset: true }).optional(),
  })).mutation(async ({ ctx, input }) => {
    await requireSupabaseTenantPermission(ctx.supabaseUser!, input.tenantId, "quotes.manage");
    const { data, error } = await clientFor(ctx.supabaseUser).rpc("workspace_create_quote_draft_from_request", {
      target_tenant_id: input.tenantId,
      target_request_id: input.quoteRequestId,
      notes_input: input.notes ?? null,
      terms_input: input.terms ?? null,
      valid_until_input: input.validUntil ?? null,
    });
    if (error || !data) throw databaseError(error);
    const result = parseWorkspaceQuoteDraft(data);
    if (!result.success || result.data.tenantId !== input.tenantId || result.data.requestId !== input.quoteRequestId) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "A criação do rascunho retornou dados incompatíveis." });
    }
    return result.data;
  }),

  update: supabaseProtectedProcedure.input(tenantInput.extend({ quoteRequestId: z.number().int().positive(), status, assignedToUserId: z.string().uuid().nullable().optional() })).mutation(async ({ ctx, input }) => {
    await requireSupabaseTenantPermission(ctx.supabaseUser!, input.tenantId, "quotes.manage");
    const { error } = await clientFor(ctx.supabaseUser).rpc("workspace_update_quote_request", { target_tenant_id: input.tenantId, target_request_id: input.quoteRequestId, target_status: input.status, assigned_user: input.assignedToUserId ?? null });
    if (error) throw databaseError(error);
    return { ok: true };
  }),

  generateQuote: supabaseProtectedProcedure.input(tenantInput.extend({ quoteRequestId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    await requireSupabaseTenantPermission(ctx.supabaseUser!, input.tenantId, "quotes.manage");
    const { data, error } = await clientFor(ctx.supabaseUser).rpc("workspace_generate_quote_from_request", {
      target_tenant_id: input.tenantId,
      target_request_id: input.quoteRequestId,
    });
    if (error || !data) throw databaseError(error);
    const result = parseWorkspaceGenerateQuote(data);
    if (!result.success || result.data.tenantId !== input.tenantId || result.data.requestId !== input.quoteRequestId) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "A geração da proposta retornou dados incompatíveis." });
    }
    return result.data;
  }),
});
