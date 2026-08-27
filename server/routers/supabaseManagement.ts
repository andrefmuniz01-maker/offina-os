import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createSupabaseClient } from "../_core/supabase";
import { router, supabaseProtectedProcedure } from "../_core/trpc";
import { requireSupabaseTenantPermission, getSupabaseTenantAccess, hasSupabasePermission } from "../supabaseTenantAccess";

const tenantInput = z.object({ tenantId: z.number().int().positive() });

const workspaceTeamPermission = z.enum([
  "tenant.manage",
  "team.manage",
  "customers.manage",
  "catalog.manage",
  "inventory.manage",
  "purchases.manage",
  "quotes.manage",
  "appointments.manage",
  "work_orders.manage",
  "work_orders.execute",
  "financial.view",
  "financial.manage",
  "reports.view",
]);

const workspaceTeamListSchema = z.array(z.object({
  member: z.object({
    userId: z.string().uuid(),
    role: z.enum(["owner", "admin", "attendant", "technician"]),
    permissions: z.array(workspaceTeamPermission).nullable(),
    active: z.boolean(),
  }).strict(),
  user: z.object({
    id: z.string().uuid(),
    name: z.string().nullable(),
    email: z.string().email().nullable(),
  }).strict(),
}).strict());

function databaseError(error: { code?: string | null; message?: string | null } | null) {
  if (error?.code === "42501") return new TRPCError({ code: "FORBIDDEN", message: error.message ?? "Seu perfil não possui acesso a esta oficina." });
  if (error?.code === "P0002") return new TRPCError({ code: "NOT_FOUND", message: error.message ?? "Registro não encontrado nesta oficina." });
  if (error?.code === "22023") return new TRPCError({ code: "BAD_REQUEST", message: error.message ?? "Dados inválidos." });
  return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível consultar o banco Supabase." });
}

export const supabaseManagementRouter = router({
  reports: router({
    overview: supabaseProtectedProcedure.input(tenantInput.extend({ referenceDate: z.date().optional() })).query(async ({ ctx, input }) => {
      await requireSupabaseTenantPermission(ctx.supabaseUser!, input.tenantId, "reports.view");
      const { data, error } = await createSupabaseClient(ctx.supabaseUser!.accessToken).rpc("workspace_dashboard_report", {
        target_tenant_id: input.tenantId,
        reference_at: (input.referenceDate ?? new Date()).toISOString(),
      });
      if (error) throw databaseError(error);
      return data as {
        sales: { billing: number; expectedRevenue: number; averageTicket: number; completedOrders: number; quoteApprovalRate: number };
        commercial: { pendingQuoteValue: number; pendingQuoteCount: number };
        operation: { scheduled: number; inProgress: number; yard: number };
        inventory: { critical: number; reservedProducts: number };
        finance?: { expenses: number; estimatedOperationalResult: number };
      };
    }),
  }),

  notifications: router({
    preferences: supabaseProtectedProcedure.input(tenantInput).query(async ({ ctx, input }) => {
      const { data, error } = await createSupabaseClient(ctx.supabaseUser!.accessToken).rpc("workspace_notification_preferences", { target_tenant_id: input.tenantId });
      if (error) throw databaseError(error);
      const row = (data ?? {}) as { inAppEnabled?: boolean; emailEnabled?: boolean; enabledTypes?: unknown };
      return { inAppEnabled: row.inAppEnabled !== false, emailEnabled: row.emailEnabled === true, enabledTypes: Array.isArray(row.enabledTypes) ? row.enabledTypes.filter((value): value is string => typeof value === "string") : [] };
    }),
    updatePreferences: supabaseProtectedProcedure.input(tenantInput.extend({ inAppEnabled: z.boolean(), enabledTypes: z.array(z.string().max(120)).max(50) })).mutation(async ({ ctx, input }) => {
      const { data, error } = await createSupabaseClient(ctx.supabaseUser!.accessToken).rpc("workspace_update_notification_preferences", { target_tenant_id: input.tenantId, in_app_enabled_input: input.inAppEnabled, enabled_types_input: input.enabledTypes });
      if (error) throw databaseError(error);
      const row = (data ?? {}) as { inAppEnabled?: boolean; emailEnabled?: boolean; enabledTypes?: unknown };
      return { inAppEnabled: row.inAppEnabled !== false, emailEnabled: row.emailEnabled === true, enabledTypes: Array.isArray(row.enabledTypes) ? row.enabledTypes.filter((value): value is string => typeof value === "string") : [] };
    }),
    listMine: supabaseProtectedProcedure.input(tenantInput.extend({ page: z.number().int().min(1).default(1), pageSize: z.number().int().min(1).max(100).default(15) })).query(async ({ ctx, input }) => {
      const { data, error } = await createSupabaseClient(ctx.supabaseUser!.accessToken).rpc("workspace_list_notifications", { target_tenant_id: input.tenantId, page_input: input.page, page_size_input: input.pageSize });
      if (error) throw databaseError(error);
      return (data ?? { items: [], page: input.page, pageSize: input.pageSize, hasMore: false }) as { items: Array<{ notification: { id: number; tenantId: number; userId: string | null; customerId: number | null; vehicleId: number | null; workOrderId: number | null; type: string; title: string; body: string; link: string | null; readAt: string | null; createdAt: string }; customer: { id: number; name: string } | null; vehicle: { id: number; make: string; model: string; plate: string | null } | null }>; page: number; pageSize: number; hasMore: boolean };
    }),
    markRead: supabaseProtectedProcedure.input(tenantInput.extend({ notificationId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const { data, error } = await createSupabaseClient(ctx.supabaseUser!.accessToken).rpc("workspace_mark_notification_read", { target_tenant_id: input.tenantId, target_notification_id: input.notificationId });
      if (error) throw databaseError(error);
      return data as { success: true };
    }),
  }),

  audit: router({
    list: supabaseProtectedProcedure.input(tenantInput.extend({ search: z.string().trim().max(120).optional(), page: z.number().int().min(1).default(1), pageSize: z.number().int().min(1).max(100).default(20) })).query(async ({ ctx, input }) => {
      await requireSupabaseTenantPermission(ctx.supabaseUser!, input.tenantId, "tenant.manage");
      const { data, error } = await createSupabaseClient(ctx.supabaseUser!.accessToken).rpc("workspace_list_audit_logs", { target_tenant_id: input.tenantId, search_input: input.search ?? null, page_input: input.page, page_size_input: input.pageSize });
      if (error) throw databaseError(error);
      return (data ?? { items: [], page: input.page, pageSize: input.pageSize, hasMore: false }) as { items: Array<{ id: number; action: string; entityType: string; entityId: number | null; metadata: Record<string, unknown> | null; createdAt: string }>; page: number; pageSize: number; hasMore: boolean };
    }),
  }),

  settings: router({
    get: supabaseProtectedProcedure.input(tenantInput).query(async ({ ctx, input }) => {
      await requireSupabaseTenantPermission(ctx.supabaseUser!, input.tenantId, "tenant.manage");
      const { data, error } = await createSupabaseClient(ctx.supabaseUser!.accessToken).rpc("workspace_get_tenant_settings", { target_tenant_id: input.tenantId });
      if (error) throw databaseError(error);
      return data as { legalName: string | null; document: string | null; phone: string | null; whatsapp: string | null; email: string | null; defaultLaborHourlyRate: number; defaultPartsMarginPercent: number; defaultPartsMarkupPercent: number; quoteValidityDays: number; minimumMarginPercent: number; attendantMaxDiscountPercent: number; quoteMessageTemplate: string | null };
    }),
    update: supabaseProtectedProcedure.input(tenantInput.extend({ legalName: z.string().nullable(), document: z.string().nullable(), phone: z.string().nullable(), whatsapp: z.string().nullable(), email: z.string().nullable(), defaultLaborHourlyRate: z.number().finite().nonnegative(), defaultPartsMarginPercent: z.number().finite().nonnegative(), defaultPartsMarkupPercent: z.number().finite().nonnegative(), quoteValidityDays: z.number().int().min(1).max(365), minimumMarginPercent: z.number().finite().nonnegative(), attendantMaxDiscountPercent: z.number().finite().nonnegative(), quoteMessageTemplate: z.string().nullable() })).mutation(async ({ ctx, input }) => {
      const { data, error } = await createSupabaseClient(ctx.supabaseUser!.accessToken).rpc("workspace_update_tenant_settings", { target_tenant_id: input.tenantId, payload: { legalName: input.legalName, document: input.document, phone: input.phone, whatsapp: input.whatsapp, email: input.email, defaultLaborHourlyRate: input.defaultLaborHourlyRate, defaultPartsMarginPercent: input.defaultPartsMarginPercent, defaultPartsMarkupPercent: input.defaultPartsMarkupPercent, quoteValidityDays: input.quoteValidityDays, minimumMarginPercent: input.minimumMarginPercent, attendantMaxDiscountPercent: input.attendantMaxDiscountPercent, quoteMessageTemplate: input.quoteMessageTemplate } });
      if (error) throw databaseError(error);
      return data as { legalName: string | null };
    }),
  }),

  team: router({
    list: supabaseProtectedProcedure.input(tenantInput).query(async ({ ctx, input }) => {
      await requireSupabaseTenantPermission(ctx.supabaseUser!, input.tenantId, "tenant.manage");
      const { data, error } = await createSupabaseClient(ctx.supabaseUser!.accessToken).rpc("workspace_list_team_members", { target_tenant_id: input.tenantId });
      if (error) throw databaseError(error);
      const result = workspaceTeamListSchema.safeParse(data ?? []);
      if (!result.success) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "A equipe retornou dados incompatíveis." });
      return result.data;
    }),
  }),

  branding: router({
    get: supabaseProtectedProcedure.input(tenantInput).query(async ({ ctx, input }) => {
      await requireSupabaseTenantPermission(ctx.supabaseUser!, input.tenantId, "tenant.manage");
      const { data, error } = await createSupabaseClient(ctx.supabaseUser!.accessToken).rpc("workspace_get_tenant_branding", { target_tenant_id: input.tenantId });
      if (error) throw databaseError(error);
      return data as { logoUrl: string | null; publicTitle: string | null; primaryColor: string; secondaryColor: string; accentColor: string };
    }),
    update: supabaseProtectedProcedure.input(tenantInput.extend({ publicTitle: z.string().nullable(), primaryColor: z.string().regex(/^#[0-9a-f]{6}$/i), secondaryColor: z.string().regex(/^#[0-9a-f]{6}$/i), accentColor: z.string().regex(/^#[0-9a-f]{6}$/i) })).mutation(async ({ ctx, input }) => {
      const { data, error } = await createSupabaseClient(ctx.supabaseUser!.accessToken).rpc("workspace_update_tenant_branding", { target_tenant_id: input.tenantId, payload: { publicTitle: input.publicTitle, primaryColor: input.primaryColor, secondaryColor: input.secondaryColor, accentColor: input.accentColor } });
      if (error) throw databaseError(error);
      return data as { publicTitle: string | null };
    }),
  }),
});
