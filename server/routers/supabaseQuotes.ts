import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createSupabaseClient } from "../_core/supabase";
import { router, supabaseProtectedProcedure } from "../_core/trpc";
import { requireSupabaseTenantPermission } from "../supabaseTenantAccess";
import { parseWorkspaceQuoteDetail, parseWorkspaceQuoteDiscountUpdate, parseWorkspaceQuoteFinalize, parseWorkspaceQuoteList } from "./supabaseQuoteContract";

const tenantInput = z.object({ tenantId: z.number().int().positive() });
const quoteStatus = z.enum(["draft", "ready", "sent", "viewed", "approved", "rejected", "expired", "cancelled"]);

function clientFor(user: { accessToken: string } | null) {
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Autenticação Supabase obrigatória." });
  return createSupabaseClient(user.accessToken);
}

function databaseError(error: { code?: string | null; message?: string | null } | null) {
  if (error?.code === "42501") return new TRPCError({ code: "FORBIDDEN", message: error.message ?? "Seu perfil não possui acesso aos orçamentos desta oficina." });
  if (error?.code === "22023") return new TRPCError({ code: "BAD_REQUEST", message: error.message ?? "Dados inválidos." });
  if (error?.code === "P0002") return new TRPCError({ code: "NOT_FOUND", message: error.message ?? "Orçamento não encontrado nesta oficina." });
  if (error?.code === "P0001") return new TRPCError({ code: "CONFLICT", message: error.message ?? "Este orçamento foi alterado em outra sessão." });
  return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível consultar os orçamentos no banco Supabase." });
}

export const supabaseQuoteRouter = router({
  list: supabaseProtectedProcedure.input(tenantInput.extend({ status: quoteStatus.optional(), search: z.string().trim().max(120).optional(), page: z.number().int().min(1).default(1), pageSize: z.number().int().min(1).max(100).default(25) })).query(async ({ ctx, input }) => {
    await requireSupabaseTenantPermission(ctx.supabaseUser!, input.tenantId, "quotes.manage");
    const { data, error } = await clientFor(ctx.supabaseUser).rpc("workspace_list_quotes", {
      target_tenant_id: input.tenantId,
      target_status: input.status ?? null,
      search_input: input.search ?? null,
      page_input: input.page,
      page_size_input: input.pageSize,
    });
    if (error || !data) throw databaseError(error);
    const result = parseWorkspaceQuoteList(data);
    if (!result.success) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "A fila de orçamentos recebeu dados em formato inválido." });
    return { ...result.data, items: result.data.items.slice(0, input.pageSize) };
  }),

  detail: supabaseProtectedProcedure.input(tenantInput.extend({ quoteId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    await requireSupabaseTenantPermission(ctx.supabaseUser!, input.tenantId, "quotes.manage");
    const { data, error } = await clientFor(ctx.supabaseUser).rpc("workspace_quote_detail", {
      target_tenant_id: input.tenantId,
      target_quote_id: input.quoteId,
    });
    if (error || !data) throw databaseError(error);
    const result = parseWorkspaceQuoteDetail(data);
    if (!result.success || result.data.quote.tenantId !== input.tenantId || result.data.quote.id !== input.quoteId) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "O detalhe do orçamento retornou dados incompatíveis." });
    }
    return result.data;
  }),

  updateDraftDiscounts: supabaseProtectedProcedure.input(tenantInput.extend({
    quoteId: z.number().int().positive(),
    discounts: z.array(z.object({ quoteItemId: z.number().int().positive(), discount: z.number().finite().nonnegative() })).min(1).max(100),
    expectedUpdatedAt: z.string().datetime({ offset: true }),
    overrideReason: z.string().trim().min(3).max(1000).optional(),
  })).mutation(async ({ ctx, input }) => {
    await requireSupabaseTenantPermission(ctx.supabaseUser!, input.tenantId, "quotes.manage");
    const { data, error } = await clientFor(ctx.supabaseUser).rpc("workspace_update_quote_draft_discounts", {
      target_tenant_id: input.tenantId,
      target_quote_id: input.quoteId,
      discounts_input: input.discounts.map(item => ({ quoteItemId: item.quoteItemId, discount: item.discount })),
      expected_updated_at_input: input.expectedUpdatedAt,
      override_reason_input: input.overrideReason ?? null,
    });
    if (error || !data) throw databaseError(error);
    const result = parseWorkspaceQuoteDiscountUpdate(data);
    if (!result.success || result.data.tenantId !== input.tenantId || result.data.id !== input.quoteId) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "A atualização de desconto retornou dados incompatíveis." });
    }
    return result.data;
  }),

  finalizeDraft: supabaseProtectedProcedure.input(tenantInput.extend({
    quoteId: z.number().int().positive(),
    expectedUpdatedAt: z.string().datetime({ offset: true }),
  })).mutation(async ({ ctx, input }) => {
    await requireSupabaseTenantPermission(ctx.supabaseUser!, input.tenantId, "quotes.manage");
    const { data, error } = await clientFor(ctx.supabaseUser).rpc("workspace_finalize_quote_draft", {
      target_tenant_id: input.tenantId,
      target_quote_id: input.quoteId,
      expected_updated_at_input: input.expectedUpdatedAt,
    });
    if (error || !data) throw databaseError(error);
    const result = parseWorkspaceQuoteFinalize(data);
    if (!result.success || result.data.tenantId !== input.tenantId || result.data.id !== input.quoteId) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "A finalização retornou dados incompatíveis." });
    }
    return result.data;
  }),
});
