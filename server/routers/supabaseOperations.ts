import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { SupabaseSessionUser } from "../_core/context";
import { createSupabaseClient } from "../_core/supabase";
import { router, supabaseProtectedProcedure } from "../_core/trpc";
import { workspaceAvailableSlotsSchema, workspaceAwaitingScheduleSchema, workspaceSchedulingLinkSchema } from "./supabaseSchedulingContract";
import { getSupabaseTenantAccess, hasSupabasePermission, requireSupabaseTenantPermission } from "../supabaseTenantAccess";
import {
  parseWorkspaceAppointmentList,
  parseWorkspaceCalendarAppointments,
  parseWorkspaceManualAppointment,
  parseWorkspaceQuoteSchedule,
  parseWorkspaceWorkOrderChecklistUpdate,
  parseWorkspaceWorkOrderDetail,
  parseWorkspaceWorkOrderKanban,
  parseWorkspaceWorkOrderReservationConsumption,
  parseWorkspaceWorkOrderStatusUpdate,
} from "./supabaseQuoteContract";

const scheduleInput = z.object({
  tenantId: z.number().int().positive(),
  quoteId: z.number().int().positive(),
  scheduledStart: z.string().datetime({ offset: true }),
  scheduledEnd: z.string().datetime({ offset: true }),
  assignedToUserId: z.string().uuid().optional(),
  bay: z.string().trim().max(80).optional(),
  bayId: z.number().int().positive().optional(),
  notes: z.string().trim().max(4000).optional(),
  promisedDeliveryAt: z.string().datetime({ offset: true }).optional(),
});

const manualAppointmentInput = z.object({
  tenantId: z.number().int().positive(),
  customerId: z.number().int().positive(),
  vehicleId: z.number().int().positive(),
  serviceIds: z.array(z.number().int().positive()).min(1).max(30),
  scheduledStart: z.string().datetime({ offset: true }),
  bayId: z.number().int().positive(),
  promisedDeliveryAt: z.string().datetime({ offset: true }).optional(),
  assignedToUserId: z.string().uuid().optional(),
  notes: z.string().trim().max(4000).optional(),
});

const calendarRangeInput = z.object({
  tenantId: z.number().int().positive(),
  from: z.string().datetime({ offset: true }),
  to: z.string().datetime({ offset: true }),
});

const workOrderReferenceInput = z.object({
  tenantId: z.number().int().positive(),
  workOrderId: z.number().int().positive(),
}).strict();

const workOrderChecklistInput = z.object({
  tenantId: z.number().int().positive(),
  checklistId: z.number().int().positive(),
  completed: z.boolean(),
}).strict();

const workOrderStatusInput = workOrderReferenceInput.extend({
  status: z.enum(["scheduled", "confirmed", "received", "diagnosis", "awaiting_approval", "awaiting_part", "in_service", "completed", "delivered", "cancelled"]),
  notes: z.string().trim().max(4000).optional(),
}).strict();

const workOrderConsumptionInput = workOrderReferenceInput.extend({
  reservationId: z.number().int().positive(),
  quantity: z.number().finite().positive().max(1000000),
}).strict();

function clientFor(user: SupabaseSessionUser | null) {
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Autenticação Supabase obrigatória." });
  return createSupabaseClient(user.accessToken);
}

function databaseError(error: { code?: string | null; message?: string | null } | null) {
  if (error?.code === "42501") return new TRPCError({ code: "FORBIDDEN", message: error.message ?? "Seu perfil não possui permissão para esta operação nesta oficina." });
  if (error?.code === "22023") return new TRPCError({ code: "BAD_REQUEST", message: error.message ?? "Dados operacionais inválidos." });
  if (error?.code === "P0002") return new TRPCError({ code: "NOT_FOUND", message: error.message ?? "Registro operacional não encontrado nesta oficina." });
  if (error?.code === "23505") return new TRPCError({ code: "CONFLICT", message: "Este registro já possui uma operação relacionada." });
  if (error?.code === "P0001" || error?.code === "40001") return new TRPCError({ code: "CONFLICT", message: error.message ?? "O registro foi alterado em outra sessão. Atualize a tela e tente novamente." });
  return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível concluir esta operação agora." });
}

async function requireWorkOrderAccess(user: SupabaseSessionUser, tenantId: number) {
  const access = await getSupabaseTenantAccess(user, tenantId);
  if (!hasSupabasePermission(access, "work_orders.manage") && access.membership?.role !== "technician") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Seu perfil não possui acesso à ordem de serviço desta oficina." });
  }
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
      bay_id_input: input.bayId ?? null,
      promised_delivery_at_input: input.promisedDeliveryAt ?? null,
    });
    if (error || !data) throw databaseError(error);
    const result = parseWorkspaceQuoteSchedule(data);
    if (!result.success) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "O agendamento retornou dados incompatíveis." });
    return result.data;
  }),

  createManualAppointment: supabaseProtectedProcedure.input(manualAppointmentInput).mutation(async ({ ctx, input }) => {
    await requireSupabaseTenantPermission(ctx.supabaseUser!, input.tenantId, "appointments.manage");
    const { data, error } = await clientFor(ctx.supabaseUser).rpc("workspace_create_manual_appointment", {
      target_tenant_id: input.tenantId,
      customer_id_input: input.customerId,
      vehicle_id_input: input.vehicleId,
      service_ids_input: input.serviceIds,
      scheduled_start_input: input.scheduledStart,
      bay_id_input: input.bayId,
      promised_delivery_at_input: input.promisedDeliveryAt ?? null,
      assigned_to_user_id_input: input.assignedToUserId ?? null,
      notes_input: input.notes ?? null,
    });
    if (error || !data) throw databaseError(error);
    const result = parseWorkspaceManualAppointment(data);
    if (!result.success) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "O agendamento manual retornou dados incompatíveis." });
    return result.data;
  }),

  /** Próximos horários livres (para uma proposta aprovada ou para serviços escolhidos). */
  availableSlots: supabaseProtectedProcedure.input(z.object({ tenantId: z.number().int().positive(), quoteId: z.number().int().positive().optional(), serviceIds: z.array(z.number().int().positive()).max(30).optional(), days: z.number().int().min(1).max(30).default(14) })).query(async ({ ctx, input }) => {
    await requireSupabaseTenantPermission(ctx.supabaseUser, input.tenantId, "appointments.manage");
    const { data, error } = await clientFor(ctx.supabaseUser).rpc("workspace_available_slots", { target_tenant_id: input.tenantId, target_quote_id: input.quoteId ?? null, service_ids_input: input.serviceIds ?? null, days_input: input.days });
    if (error || !data) throw databaseError(error);
    const result = workspaceAvailableSlotsSchema.safeParse(data);
    if (!result.success) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Os horários retornaram dados incompatíveis." });
    return result.data;
  }),
  /** Fila da Agenda: propostas aprovadas que ainda não têm horário. */
  awaitingScheduling: supabaseProtectedProcedure.input(z.object({ tenantId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    await requireSupabaseTenantPermission(ctx.supabaseUser, input.tenantId, "appointments.manage");
    const { data, error } = await clientFor(ctx.supabaseUser).rpc("workspace_quotes_awaiting_schedule", { target_tenant_id: input.tenantId });
    if (error) throw databaseError(error);
    const result = workspaceAwaitingScheduleSchema.safeParse(data ?? []);
    if (!result.success) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "A fila de agendamento retornou dados incompatíveis." });
    return result.data;
  }),
  /** Dados para a mensagem de WhatsApp com o link de agendamento de uma proposta aprovada. */
  quoteSchedulingLink: supabaseProtectedProcedure.input(z.object({ tenantId: z.number().int().positive(), quoteId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    await requireSupabaseTenantPermission(ctx.supabaseUser, input.tenantId, "appointments.manage");
    const { data, error } = await clientFor(ctx.supabaseUser).rpc("workspace_quote_scheduling_link", { target_tenant_id: input.tenantId, target_quote_id: input.quoteId });
    if (error || !data) throw databaseError(error);
    const result = workspaceSchedulingLinkSchema.safeParse(data);
    if (!result.success) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "O link de agendamento retornou dados incompatíveis." });
    return result.data;
  }),
  calendar: supabaseProtectedProcedure.input(calendarRangeInput).query(async ({ ctx, input }) => {
    const access = await getSupabaseTenantAccess(ctx.supabaseUser!, input.tenantId);
    if (!hasSupabasePermission(access, "appointments.manage") && access.membership?.role !== "technician") throw new TRPCError({ code: "FORBIDDEN", message: "Seu perfil não possui acesso à agenda desta oficina." });
    const { data, error } = await clientFor(ctx.supabaseUser).rpc("workspace_calendar_appointments", { target_tenant_id: input.tenantId, range_start_input: input.from, range_end_input: input.to });
    if (error || !data) throw databaseError(error);
    const result = parseWorkspaceCalendarAppointments(data);
    if (!result.success) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "O calendário retornou dados incompatíveis." });
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

  workOrderDetail: supabaseProtectedProcedure.input(workOrderReferenceInput).query(async ({ ctx, input }) => {
    await requireWorkOrderAccess(ctx.supabaseUser!, input.tenantId);
    const { data, error } = await clientFor(ctx.supabaseUser).rpc("workspace_work_order_detail", {
      target_tenant_id: input.tenantId,
      target_work_order_id: input.workOrderId,
    });
    if (error || !data) throw databaseError(error);
    const result = parseWorkspaceWorkOrderDetail(data);
    if (!result.success) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "A ordem de serviço retornou dados incompatíveis." });
    return result.data;
  }),

  toggleWorkOrderChecklist: supabaseProtectedProcedure.input(workOrderChecklistInput).mutation(async ({ ctx, input }) => {
    await requireWorkOrderAccess(ctx.supabaseUser!, input.tenantId);
    const { data, error } = await clientFor(ctx.supabaseUser).rpc("workspace_toggle_work_order_checklist", {
      target_tenant_id: input.tenantId,
      target_checklist_id: input.checklistId,
      completed_input: input.completed,
    });
    if (error || !data) throw databaseError(error);
    const result = parseWorkspaceWorkOrderChecklistUpdate(data);
    if (!result.success) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "O checklist retornou dados incompatíveis." });
    return result.data;
  }),

  updateWorkOrderStatus: supabaseProtectedProcedure.input(workOrderStatusInput).mutation(async ({ ctx, input }) => {
    await requireWorkOrderAccess(ctx.supabaseUser!, input.tenantId);
    const { data, error } = await clientFor(ctx.supabaseUser).rpc("workspace_update_work_order_status", {
      target_tenant_id: input.tenantId,
      target_work_order_id: input.workOrderId,
      next_status: input.status,
      notes_input: input.notes ?? null,
    });
    if (error || !data) throw databaseError(error);
    const result = parseWorkspaceWorkOrderStatusUpdate(data);
    if (!result.success) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "A atualização de status retornou dados incompatíveis." });
    return result.data;
  }),

  consumeWorkOrderReservation: supabaseProtectedProcedure.input(workOrderConsumptionInput).mutation(async ({ ctx, input }) => {
    await requireWorkOrderAccess(ctx.supabaseUser!, input.tenantId);
    const { data, error } = await clientFor(ctx.supabaseUser).rpc("workspace_consume_work_order_reservation", {
      target_tenant_id: input.tenantId,
      target_work_order_id: input.workOrderId,
      target_reservation_id: input.reservationId,
      quantity_input: input.quantity,
    });
    if (error || !data) throw databaseError(error);
    const result = parseWorkspaceWorkOrderReservationConsumption(data);
    if (!result.success) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "O consumo retornou dados incompatíveis." });
    return result.data;
  }),
});
