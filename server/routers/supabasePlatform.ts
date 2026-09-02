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
