import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createSupabaseClient } from "../_core/supabase";
import { router, supabaseProtectedProcedure } from "../_core/trpc";
import { getSupabaseTenantAccess, hasSupabasePermission, requireSupabaseTenantPermission } from "../supabaseTenantAccess";
import { parseWorkspaceAppointmentList, parseWorkspaceQuoteSchedule, parseWorkspaceWorkOrderKanban } from "./supabaseQuoteContract";

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
  if (error?.code === "P0001" || error?.code === "40001") return new TRPCError({ code: "CONFLICT", message: error.message ?? "O registro foi alterado em outra sessão. Atualize a tela e tente novamente." });
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

  listAppointments: supabaseProtectedProcedure.input(z.object({ tenantId: z.number().int().positive(), from: z.string().datetime({ offset: true }), to: z.string().datetime({ offset: true }), search: z.string().trim().max(120).optional() })).query(async ({ ctx, input }) => {
    const access = await getSupabaseTenantAccess(ctx.supabaseUser!, input.tenantId);
    if (!hasSupabasePermission(access, "appointments.manage") && access.membership?.role !== "technician") throw new TRPCError({ code: "FORBIDDEN", message: "Seu perfil não possui acesso à operação desta oficina." });
    const { data, error } = await clientFor(ctx.supabaseUser).rpc("workspace_list_appointments", { target_tenant_id: input.tenantId, from_at: input.from, to_at: input.to, search_input: input.search ?? null });
    if (error || !data) throw databaseError(error);
    const result = parseWorkspaceAppointmentList(data);
    if (!result.success) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "A agenda retornou dados incompatíveis." });
    return result.data;
  }),

  listYard: supabaseProtectedProcedure.input(z.object({ tenantId: z.number().int().positive(), search: z.string().trim().max(120).optional() })).query(async ({ ctx, input }) => {
    const access = await getSupabaseTenantAccess(ctx.supabaseUser!, input.tenantId);
    if (!hasSupabasePermission(access, "work_orders.manage") && access.membership?.role !== "technician") throw new TRPCError({ code: "FORBIDDEN", message: "Seu perfil não possui acesso ao pátio desta oficina." });
    const { data, error } = await clientFor(ctx.supabaseUser).rpc("workspace_list_work_order_kanban", { target_tenant_id: input.tenantId, search_input: input.search ?? null });
    if (error || !data) throw databaseError(error);
    const result = parseWorkspaceWorkOrderKanban(data);
    if (!result.success) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "O pátio retornou dados incompatíveis." });
    return result.data;
  }),

  workOrders: router({
    detail: supabaseProtectedProcedure.input(z.object({ tenantId: z.number().int().positive(), workOrderId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const access = await getSupabaseTenantAccess(ctx.supabaseUser!, input.tenantId);
      if (!hasSupabasePermission(access, "work_orders.manage") && !hasSupabasePermission(access, "work_orders.execute")) throw new TRPCError({ code: "FORBIDDEN", message: "Seu perfil não possui acesso à OS desta oficina." });
      const { data, error } = await clientFor(ctx.supabaseUser).rpc("workspace_work_order_detail", { target_tenant_id: input.tenantId, target_work_order_id: input.workOrderId });
      if (error || !data) throw databaseError(error);
      return data as {
        order: { id: number; tenantId: number; number: number; quoteId: number | null; appointmentId: number | null; customerId: number; vehicleId: number; status: string; assignedToUserId: string | null; estimatedTotal: number | string; notes: string | null; completedAt: string | null; deliveredAt: string | null; createdAt: string };
        items: Array<{ id: number; workOrderId: number; productId: number | null; serviceId: number | null; description: string; itemType: string; quantity: number | string; unitPrice: number | string }>;
        checklist: Array<{ id: number; label: string; completed: boolean; completedAt: string | null; sortOrder: number }>;
        consumption: Array<{ id: number; workOrderId: number; productId: number; reservationId: number | null; quantity: number | string; createdAt: string }>;
        reservations: Array<{ id: number; productId: number; quoteId: number | null; workOrderId: number | null; quantity: number | string; status: string }>;
        executionAttachments: Array<{ id: number; filename: string; mimeType: string; sizeBytes: number; url: string | null; createdAt: string }>;
        notes: Array<{ id: number; body: string; createdAt: string }>;
      };
    }),
    updateStatus: supabaseProtectedProcedure.input(z.object({ tenantId: z.number().int().positive(), workOrderId: z.number().int().positive(), status: z.enum(["scheduled", "received", "diagnosis", "awaiting_approval", "awaiting_part", "in_service", "completed", "delivered", "cancelled"]), notes: z.string().max(4000).optional() })).mutation(async ({ ctx, input }) => {
      const access = await getSupabaseTenantAccess(ctx.supabaseUser!, input.tenantId);
      if (!hasSupabasePermission(access, "work_orders.manage") && !hasSupabasePermission(access, "work_orders.execute")) throw new TRPCError({ code: "FORBIDDEN", message: "Seu perfil não possui permissão para atualizar a OS." });
      const { data, error } = await clientFor(ctx.supabaseUser).rpc("workspace_update_work_order_status", { target_tenant_id: input.tenantId, target_work_order_id: input.workOrderId, next_status: input.status, notes_input: input.notes ?? null });
      if (error || !data) throw databaseError(error);
      return data as { success: true; status: string; idempotent?: boolean };
    }),
    toggleChecklist: supabaseProtectedProcedure.input(z.object({ tenantId: z.number().int().positive(), checklistId: z.number().int().positive(), completed: z.boolean() })).mutation(async ({ ctx, input }) => {
      const access = await getSupabaseTenantAccess(ctx.supabaseUser!, input.tenantId);
      if (!hasSupabasePermission(access, "work_orders.manage") && !hasSupabasePermission(access, "work_orders.execute")) throw new TRPCError({ code: "FORBIDDEN", message: "Seu perfil não possui permissão para atualizar o checklist." });
      const { data, error } = await clientFor(ctx.supabaseUser).rpc("workspace_toggle_work_order_checklist", { target_tenant_id: input.tenantId, target_checklist_id: input.checklistId, completed_input: input.completed });
      if (error || !data) throw databaseError(error);
      return data as { success: true };
    }),
    consumeProduct: supabaseProtectedProcedure.input(z.object({ tenantId: z.number().int().positive(), workOrderId: z.number().int().positive(), productId: z.number().int().positive(), quantity: z.coerce.number().positive(), reservationId: z.number().int().positive().optional() })).mutation(async ({ ctx, input }) => {
      const access = await getSupabaseTenantAccess(ctx.supabaseUser!, input.tenantId);
      if (!hasSupabasePermission(access, "work_orders.manage") && !hasSupabasePermission(access, "work_orders.execute")) throw new TRPCError({ code: "FORBIDDEN", message: "Seu perfil não possui permissão para registrar consumo." });
      const { data, error } = await clientFor(ctx.supabaseUser).rpc("workspace_consume_work_order_product", { target_tenant_id: input.tenantId, target_work_order_id: input.workOrderId, target_product_id: input.productId, target_quantity: input.quantity, target_reservation_id: input.reservationId ?? null });
      if (error || !data) throw databaseError(error);
      return data as { success: true };
    }),
    addNote: supabaseProtectedProcedure.input(z.object({ tenantId: z.number().int().positive(), workOrderId: z.number().int().positive(), body: z.string().trim().min(1).max(4000) })).mutation(async ({ ctx, input }) => {
      const access = await getSupabaseTenantAccess(ctx.supabaseUser!, input.tenantId);
      if (!hasSupabasePermission(access, "work_orders.manage") && !hasSupabasePermission(access, "work_orders.execute")) throw new TRPCError({ code: "FORBIDDEN", message: "Seu perfil não possui permissão para adicionar apontamentos." });
      const { data, error } = await clientFor(ctx.supabaseUser).rpc("workspace_add_work_order_note", { target_tenant_id: input.tenantId, target_work_order_id: input.workOrderId, body_input: input.body });
      if (error || !data) throw databaseError(error);
      return data as { id: number };
    }),
  }),
});
