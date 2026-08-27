import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createSupabaseClient } from "../_core/supabase";
import { router, supabaseProtectedProcedure } from "../_core/trpc";
import { requireSupabaseTenantPermission } from "../supabaseTenantAccess";
import { parseWorkspaceQuoteSchedule } from "./supabaseQuoteContract";

const scheduleInput = z.object({
  tenantId: z.number().int().positive(),
  quoteId: z.number().int().positive(),
  scheduledStart: z.string().datetime({ offset: true }),
  scheduledEnd: z.string().datetime({ offset: true }),
  assignedToUserId: z.string().uuid().optional(),
  bay: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(4000).optional(),
});

function clientFor(user: { accessToken: string } | null) {
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Autenticação Supabase obrigatória." });
  return createSupabaseClient(user.accessToken);
}

function databaseError(error: { code?: string | null; message?: string | null } | null) {
  if (error?.code === "42501") return new TRPCError({ code: "FORBIDDEN", message: "Seu perfil não possui permissão para agendar nesta oficina." });
  if (error?.code === "22023") return new TRPCError({ code: "BAD_REQUEST", message: error.message ?? "Dados de agendamento inválidos." });
  if (error?.code === "P0002") return new TRPCError({ code: "NOT_FOUND", message: error.message ?? "Proposta aprovada não encontrada nesta oficina." });
  if (error?.code === "23505") return new TRPCError({ code: "CONFLICT", message: "Esta proposta já possui um agendamento." });
  if (error?.code === "P0001") return new TRPCError({ code: "CONFLICT", message: error.message ?? "A proposta foi alterada antes do agendamento." });
  return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível criar o agendamento agora." });
}

export const supabaseOperationsRouter = router({
  scheduleFromApprovedQuote: supabaseProtectedProcedure.input(scheduleInput).mutation(async ({ ctx, input }) => {
    await requireSupabaseTenantPermission(ctx.supabaseUser!, input.tenantId, "appointments.manage");
    if (new Date(input.scheduledEnd) <= new Date(input.scheduledStart)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "O término precisa ser posterior ao início do agendamento." });
    }
    const { data, error } = await clientFor(ctx.supabaseUser).rpc("workspace_schedule_approved_quote", {
      target_tenant_id: input.tenantId,
      target_quote_id: input.quoteId,
      scheduled_start_input: input.scheduledStart,
      scheduled_end_input: input.scheduledEnd,
      assigned_to_user_id_input: input.assignedToUserId ?? null,
      bay_input: input.bay ?? null,
      notes_input: input.notes ?? null,
    });
    if (error || !data) throw databaseError(error);
    const result = parseWorkspaceQuoteSchedule(data);
    if (!result.success) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "O agendamento retornou dados incompatíveis." });
    return result.data;
  }),
});
