import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createSupabaseClient, createSupabaseServiceRoleClient } from "../_core/supabase";
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

/**
 * O e-mail de convite do Supabase leva o usuário para /auth/callback com
 * type=invite; a origem é derivada da própria requisição para funcionar tanto
 * em desenvolvimento quanto em qualquer domínio de produção sem variável extra.
 */
function resolveAppOrigin(req: { headers: Record<string, unknown> }): string {
  const origin = req.headers.origin;
  if (typeof origin === "string" && origin.length > 0) return origin;
  const host = req.headers.host;
  if (typeof host === "string" && host.length > 0) return `https://${host}`;
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível determinar o endereço da aplicação para enviar o convite." });
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
        const redirectTo = `${resolveAppOrigin(ctx.req)}/auth/callback`;
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
