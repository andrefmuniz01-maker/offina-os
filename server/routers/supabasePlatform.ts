import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createSupabaseClient, createSupabaseServiceRoleClient, resolveRequestOrigin } from "../_core/supabase";
import { router, supabaseAdminProcedure } from "../_core/trpc";

const tenantIdInput = z.object({ tenantId: z.number().int().positive() });
const memberRole = z.enum(["owner", "admin", "attendant", "technician"]);

type PlatformTenant = {
  id: number;
  name: string;
  slug: string;
  status: string;
  active: boolean;
  isDemo: boolean;
  createdAt: string;
  publicIntakeLink: string;
  memberCount: number;
  ownerName: string | null;
  ownerEmail: string | null;
  planId: number | null;
  planName: string | null;
  contact: { whatsapp: string | null; email: string | null; phone: string | null; legalName: string | null; document: string | null };
  branding: { primaryColor: string | null; secondaryColor: string | null; accentColor: string | null; logoUrl: string | null; publicTitle: string | null };
};

type PlatformPlan = {
  id: number;
  code: string;
  name: string;
  description: string | null;
  maxUsers: number;
  maxCustomers: number | null;
  active: boolean;
  tenantCount: number;
};

type PlatformTenantMember = {
  id: number;
  userId: string;
  name: string | null;
  email: string | null;
  role: "owner" | "admin" | "attendant" | "technician";
  active: boolean;
  createdAt: string;
};

type PlatformAuditEntry = {
  id: number;
  tenantId: number;
  tenantName: string;
  action: string;
  entityType: string;
  entityId: number | null;
  actorName: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

type PlatformContract = {
  id: number;
  prospectName: string;
  contactWhatsapp: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  planId: number | null;
  planName: string | null;
  monthlyValue: number | string;
  status: "negotiating" | "closed" | "cancelled";
  notes: string | null;
  tenantId: number | null;
  tenantName: string | null;
  closedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
};

type PlatformRevenue = {
  id: number;
  contractId: number | null;
  contractProspectName: string | null;
  tenantId: number | null;
  tenantName: string | null;
  description: string;
  amount: number | string;
  receivedAt: string;
};

type PlatformDashboardTotals = {
  activeTenants: number;
  platformUsers: number;
  negotiatingContracts: number;
};

type PlatformDashboardPeriodRevenue = {
  periodRevenue: number | string;
  manualRevenue: number | string;
  contractRevenue: number | string;
};

type PlatformPublicLink = {
  quoteId: number;
  number: number;
  status: string;
  total: number | string;
  tenantId: number;
  tenantName: string;
  tenantSlug: string;
  customerName: string | null;
  publicUrl: string;
  sentAt: string | null;
  viewedAt: string | null;
  validUntil: string | null;
};

function databaseError(error: { code?: string | null; message?: string | null } | null) {
  if (error?.code === "42501") return new TRPCError({ code: "FORBIDDEN", message: error.message ?? "Ação restrita ao Super Admin." });
  if (error?.code === "22023") return new TRPCError({ code: "BAD_REQUEST", message: error.message ?? "Dados inválidos." });
  if (error?.code === "P0002") return new TRPCError({ code: "NOT_FOUND", message: error.message ?? "Registro não encontrado." });
  return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível concluir esta operação de plataforma agora." });
}

export const supabasePlatformRouter = router({
  tenants: router({
    list: supabaseAdminProcedure.query(async ({ ctx }) => {
      const { data, error } = await createSupabaseClient(ctx.supabaseUser!.accessToken).rpc("platform_list_tenants");
      if (error) throw databaseError(error);
      return (data ?? []) as PlatformTenant[];
    }),
    members: supabaseAdminProcedure.input(tenantIdInput).query(async ({ ctx, input }) => {
      const { data, error } = await createSupabaseClient(ctx.supabaseUser!.accessToken).rpc("platform_list_tenant_members", { target_tenant_id: input.tenantId });
      if (error) throw databaseError(error);
      return (data ?? []) as PlatformTenantMember[];
    }),
    setStatus: supabaseAdminProcedure.input(tenantIdInput.extend({ status: z.enum(["active", "suspended"]) })).mutation(async ({ ctx, input }) => {
      const { data, error } = await createSupabaseClient(ctx.supabaseUser!.accessToken).rpc("platform_set_tenant_status", { target_tenant_id: input.tenantId, status_input: input.status });
      if (error || !data) throw databaseError(error);
      return { success: true as const, status: input.status };
    }),
    setPlan: supabaseAdminProcedure.input(tenantIdInput.extend({ planId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const { data, error } = await createSupabaseClient(ctx.supabaseUser!.accessToken).rpc("platform_set_tenant_plan", { target_tenant_id: input.tenantId, target_plan_id: input.planId });
      if (error || !data) throw databaseError(error);
      return { success: true as const };
    }),
    /**
     * Edita nome, contato e marca da oficina numa chamada só. O slug (link
     * público) só é alterado quando enviado explicitamente — o front pede
     * confirmação separada antes de incluí-lo, porque muda o link já
     * divulgado ao cliente.
     */
    update: supabaseAdminProcedure.input(z.object({
      tenantId: z.number().int().positive(),
      name: z.string().trim().min(3).max(160),
      slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
      whatsapp: z.string().trim().max(32).optional(),
      email: z.string().trim().email().max(255).optional(),
      phone: z.string().trim().max(32).optional(),
      legalName: z.string().trim().max(180).optional(),
      document: z.string().trim().max(32).optional(),
      primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      logoUrl: z.string().trim().url().max(2048).optional(),
      publicTitle: z.string().trim().max(160).optional(),
    })).mutation(async ({ ctx, input }) => {
      const { data, error } = await createSupabaseClient(ctx.supabaseUser!.accessToken).rpc("platform_update_tenant_details", {
        target_tenant_id: input.tenantId,
        tenant_name: input.name,
        tenant_slug: input.slug ?? null,
        contact_whatsapp: input.whatsapp ?? null,
        contact_email: input.email ?? null,
        contact_phone: input.phone ?? null,
        legal_name_input: input.legalName ?? null,
        document_input: input.document ?? null,
        primary_color_input: input.primaryColor ?? null,
        secondary_color_input: input.secondaryColor ?? null,
        accent_color_input: input.accentColor ?? null,
        logo_url_input: input.logoUrl ?? null,
        public_title_input: input.publicTitle ?? null,
      });
      if (error || !data) throw databaseError(error);
      return { success: true as const };
    }),
  }),

  plans: router({
    list: supabaseAdminProcedure.query(async ({ ctx }) => {
      const { data, error } = await createSupabaseClient(ctx.supabaseUser!.accessToken).rpc("platform_list_plans");
      if (error) throw databaseError(error);
      return (data ?? []) as PlatformPlan[];
    }),
    upsert: supabaseAdminProcedure.input(z.object({
      planId: z.number().int().positive().optional(),
      code: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
      name: z.string().trim().min(2).max(120),
      description: z.string().trim().max(500).optional(),
      maxUsers: z.number().int().min(1).max(10000),
      maxCustomers: z.number().int().min(0).max(1000000).optional(),
      active: z.boolean().default(true),
    })).mutation(async ({ ctx, input }) => {
      const { data, error } = await createSupabaseClient(ctx.supabaseUser!.accessToken).rpc("platform_upsert_plan", {
        target_plan_id: input.planId ?? null,
        plan_code: input.code,
        plan_name: input.name,
        plan_description: input.description ?? null,
        plan_max_users: input.maxUsers,
        plan_max_customers: input.maxCustomers ?? null,
        plan_active: input.active,
      });
      if (error || !data) throw databaseError(error);
      return { id: Number((data as { id: number }).id) };
    }),
  }),

  audit: router({
    list: supabaseAdminProcedure.input(z.object({ tenantId: z.number().int().positive().optional(), actionPrefix: z.string().trim().max(60).optional(), rangeStart: z.string().datetime({ offset: true }).optional(), rangeEnd: z.string().datetime({ offset: true }).optional(), page: z.number().int().min(1).default(1), pageSize: z.number().int().min(1).max(100).default(20) })).query(async ({ ctx, input }) => {
      const { data, error } = await createSupabaseClient(ctx.supabaseUser!.accessToken).rpc("platform_list_audit_logs", { tenant_id_filter: input.tenantId ?? null, action_prefix_input: input.actionPrefix ?? null, range_start_input: input.rangeStart ?? null, range_end_input: input.rangeEnd ?? null, page_input: input.page, page_size_input: input.pageSize });
      if (error) throw databaseError(error);
      return (data ?? { items: [], page: input.page, pageSize: input.pageSize, hasMore: false }) as { items: PlatformAuditEntry[]; page: number; pageSize: number; hasMore: boolean };
    }),
  }),

  links: router({
    list: supabaseAdminProcedure.input(z.object({ status: z.array(z.enum(["draft", "ready", "sent", "viewed", "approved", "rejected", "expired", "cancelled"])).optional(), page: z.number().int().min(1).default(1), pageSize: z.number().int().min(1).max(100).default(20) })).query(async ({ ctx, input }) => {
      const { data, error } = await createSupabaseClient(ctx.supabaseUser!.accessToken).rpc("platform_list_public_links", { status_filter: input.status ?? null, page_input: input.page, page_size_input: input.pageSize });
      if (error) throw databaseError(error);
      return (data ?? { items: [], page: input.page, pageSize: input.pageSize, hasMore: false }) as { items: PlatformPublicLink[]; page: number; pageSize: number; hasMore: boolean };
    }),
  }),

  dashboard: router({
    // Sem filtro de período de propósito: reflete o estado atual (cancelar
    // um contrato ou suspender uma oficina muda o número na hora).
    totals: supabaseAdminProcedure.query(async ({ ctx }) => {
      const { data, error } = await createSupabaseClient(ctx.supabaseUser!.accessToken).rpc("platform_dashboard_totals");
      if (error) throw databaseError(error);
      return data as PlatformDashboardTotals;
    }),
    periodRevenue: supabaseAdminProcedure.input(z.object({ rangeStart: z.string().datetime({ offset: true }), rangeEnd: z.string().datetime({ offset: true }) })).query(async ({ ctx, input }) => {
      const { data, error } = await createSupabaseClient(ctx.supabaseUser!.accessToken).rpc("platform_dashboard_period_revenue", { range_start_input: input.rangeStart, range_end_input: input.rangeEnd });
      if (error) throw databaseError(error);
      return data as PlatformDashboardPeriodRevenue;
    }),
  }),

  contracts: router({
    list: supabaseAdminProcedure.query(async ({ ctx }) => {
      const { data, error } = await createSupabaseClient(ctx.supabaseUser!.accessToken).rpc("platform_list_contracts");
      if (error) throw databaseError(error);
      return (data ?? []) as PlatformContract[];
    }),
    create: supabaseAdminProcedure.input(z.object({
      prospectName: z.string().trim().min(2).max(160),
      monthlyValue: z.number().min(0),
      planId: z.number().int().positive().optional(),
      contactWhatsapp: z.string().trim().max(32).optional(),
      contactEmail: z.string().trim().email().max(255).optional(),
      contactPhone: z.string().trim().max(32).optional(),
      notes: z.string().trim().max(1000).optional(),
      tenantId: z.number().int().positive().optional(),
    })).mutation(async ({ ctx, input }) => {
      const { data, error } = await createSupabaseClient(ctx.supabaseUser!.accessToken).rpc("platform_create_contract", {
        prospect_name_input: input.prospectName,
        monthly_value_input: input.monthlyValue,
        plan_id_input: input.planId ?? null,
        contact_whatsapp_input: input.contactWhatsapp ?? null,
        contact_email_input: input.contactEmail ?? null,
        contact_phone_input: input.contactPhone ?? null,
        notes_input: input.notes ?? null,
        tenant_id_input: input.tenantId ?? null,
      });
      if (error || !data) throw databaseError(error);
      return { id: Number((data as { id: number }).id) };
    }),
    close: supabaseAdminProcedure.input(z.object({ contractId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const { data, error } = await createSupabaseClient(ctx.supabaseUser!.accessToken).rpc("platform_close_contract", { contract_id_input: input.contractId });
      if (error || !data) throw databaseError(error);
      return { success: true as const };
    }),
    cancel: supabaseAdminProcedure.input(z.object({ contractId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const { data, error } = await createSupabaseClient(ctx.supabaseUser!.accessToken).rpc("platform_cancel_contract", { contract_id_input: input.contractId });
      if (error || !data) throw databaseError(error);
      return data as { success: true; tenantId: number | null };
    }),
    generateTenant: supabaseAdminProcedure.input(z.object({ contractId: z.number().int().positive(), tenantSlug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) })).mutation(async ({ ctx, input }) => {
      const { data, error } = await createSupabaseClient(ctx.supabaseUser!.accessToken).rpc("platform_generate_tenant_from_contract", { contract_id_input: input.contractId, tenant_slug_input: input.tenantSlug });
      if (error || !data) throw databaseError(error);
      return { tenantId: Number((data as { tenantId: number }).tenantId) };
    }),
  }),

  revenues: router({
    list: supabaseAdminProcedure.input(z.object({ rangeStart: z.string().datetime({ offset: true }).optional(), rangeEnd: z.string().datetime({ offset: true }).optional() })).query(async ({ ctx, input }) => {
      const { data, error } = await createSupabaseClient(ctx.supabaseUser!.accessToken).rpc("platform_list_revenues", { range_start_input: input.rangeStart ?? null, range_end_input: input.rangeEnd ?? null });
      if (error) throw databaseError(error);
      return (data ?? []) as PlatformRevenue[];
    }),
    create: supabaseAdminProcedure.input(z.object({
      description: z.string().trim().min(2).max(300),
      amount: z.number().positive(),
      receivedAt: z.string().datetime({ offset: true }).optional(),
      contractId: z.number().int().positive().optional(),
      tenantId: z.number().int().positive().optional(),
    })).mutation(async ({ ctx, input }) => {
      const { data, error } = await createSupabaseClient(ctx.supabaseUser!.accessToken).rpc("platform_create_revenue", {
        description_input: input.description,
        amount_input: input.amount,
        received_at_input: input.receivedAt ?? null,
        contract_id_input: input.contractId ?? null,
        tenant_id_input: input.tenantId ?? null,
      });
      if (error || !data) throw databaseError(error);
      return { id: Number((data as { id: number }).id) };
    }),
  }),

  access: router({
    /**
     * Concede acesso a uma oficina por e-mail. Se a pessoa ainda não tem conta,
     * o Supabase Auth cria o usuário e dispara automaticamente o e-mail de
     * convite (link para /auth/callback?type=invite, onde ela define a senha).
     * Se o e-mail já pertence a um perfil existente, só vincula a oficina —
     * a pessoa já tem senha e acesso, não faz sentido reenviar convite.
     */
    grant: supabaseAdminProcedure.input(z.object({ tenantId: z.number().int().positive(), email: z.string().trim().email().max(255), role: memberRole, name: z.string().trim().max(160).optional() })).mutation(async ({ ctx, input }) => {
      const serviceClient = createSupabaseServiceRoleClient();
      if (!serviceClient) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "O Supabase Admin não está configurado no servidor." });

      const normalizedEmail = input.email.trim().toLowerCase();
      const { data: existingProfile, error: lookupError } = await serviceClient
        .from("profiles")
        .select("id")
        .ilike("email", normalizedEmail)
        .maybeSingle();
      if (lookupError) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível verificar se este e-mail já possui conta." });

      let userId = existingProfile?.id as string | undefined;
      let invited = false;

      if (!userId) {
        const redirectTo = `${resolveRequestOrigin(ctx.req)}/auth/callback`;
        const { data: invitedUser, error: inviteError } = await serviceClient.auth.admin.inviteUserByEmail(normalizedEmail, {
          redirectTo,
          data: input.name ? { full_name: input.name } : undefined,
        });
        if (inviteError || !invitedUser?.user) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: inviteError?.message ?? "Não foi possível enviar o convite por e-mail." });
        }
        userId = invitedUser.user.id;
        invited = true;
      }

      const { data, error } = await createSupabaseClient(ctx.supabaseUser!.accessToken).rpc("platform_grant_tenant_access", {
        target_tenant_id: input.tenantId,
        target_user_id: userId,
        role_input: input.role,
      });
      if (error || !data) throw databaseError(error);

      return { success: true as const, invited, userId };
    }),

    revoke: supabaseAdminProcedure.input(z.object({ tenantId: z.number().int().positive(), userId: z.string().uuid() })).mutation(async ({ ctx, input }) => {
      const { data, error } = await createSupabaseClient(ctx.supabaseUser!.accessToken).rpc("platform_revoke_tenant_access", {
        target_tenant_id: input.tenantId,
        target_user_id: input.userId,
      });
      if (error || !data) throw databaseError(error);
      return { success: true as const };
    }),
  }),
});
