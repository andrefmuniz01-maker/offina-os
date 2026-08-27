import { TRPCError } from "@trpc/server";
import { createSupabaseClient } from "./_core/supabase";
import type { SupabaseSessionUser } from "./_core/context";

export type TenantRole = "owner" | "admin" | "attendant" | "technician";
export type Permission =
  | "tenant.manage"
  | "team.manage"
  | "customers.manage"
  | "catalog.manage"
  | "inventory.manage"
  | "purchases.manage"
  | "quotes.manage"
  | "appointments.manage"
  | "work_orders.manage"
  | "work_orders.execute"
  | "financial.view"
  | "financial.manage"
  | "reports.view";

type TenantRecord = {
  id: number;
  name: string;
  slug: string;
  status: "trial" | "active" | "suspended" | "inactive";
  active: boolean;
  is_demo: boolean;
  primary_owner_user_id: string | null;
};

type MembershipRecord = {
  tenant_id: number;
  user_id: string;
  role: TenantRole;
  permissions: string[] | null;
  active: boolean;
};

const rolePermissions: Record<TenantRole, Permission[]> = {
  owner: [
    "tenant.manage", "team.manage", "customers.manage", "catalog.manage", "inventory.manage",
    "purchases.manage", "quotes.manage", "appointments.manage", "work_orders.manage",
    "work_orders.execute", "financial.view", "financial.manage", "reports.view",
  ],
  admin: [
    "tenant.manage", "team.manage", "customers.manage", "catalog.manage", "inventory.manage",
    "purchases.manage", "quotes.manage", "appointments.manage", "work_orders.manage",
    "work_orders.execute", "financial.view", "financial.manage", "reports.view",
  ],
  attendant: ["customers.manage", "catalog.manage", "quotes.manage", "appointments.manage", "work_orders.manage"],
  technician: ["work_orders.execute"],
};

export type SupabaseTenantAccess = {
  tenantId: number;
  tenant: TenantRecord;
  membership: MembershipRecord | null;
  isPlatformSuperAdmin: boolean;
  permissions: Permission[];
};

function isTenantRole(value: unknown): value is TenantRole {
  return value === "owner" || value === "admin" || value === "attendant" || value === "technician";
}

function isPermission(value: string): value is Permission {
  return Object.values(rolePermissions).flat().includes(value as Permission);
}

const financialPermissions = new Set<Permission>(["financial.view", "financial.manage"]);

export function resolveSupabasePermissions(role: TenantRole, custom: unknown) {
  const customPermissions = Array.isArray(custom)
    ? custom.filter((permission): permission is Permission => typeof permission === "string" && isPermission(permission))
    : [];
  const roleSafeCustomPermissions = ["owner", "admin"].includes(role)
    ? customPermissions
    : customPermissions.filter(permission => !financialPermissions.has(permission));
  return Array.from(new Set([...rolePermissions[role], ...roleSafeCustomPermissions]));
}

export function hasSupabasePermission(access: SupabaseTenantAccess, permission: Permission) {
  return access.isPlatformSuperAdmin || access.permissions.includes(permission);
}

function unavailable(message = "Banco Supabase indisponível.") {
  return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
}

export async function getSupabaseTenantAccess(
  user: SupabaseSessionUser,
  tenantId: number,
): Promise<SupabaseTenantAccess> {
  const supabase = createSupabaseClient(user.accessToken);
  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .select("id, name, slug, status, active, is_demo, primary_owner_user_id")
    .eq("id", tenantId)
    .maybeSingle<TenantRecord>();

  if (tenantError) throw unavailable();
  if (!tenant || !tenant.active || !["trial", "active"].includes(tenant.status)) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Oficina não encontrada ou inativa." });
  }

  const isPlatformSuperAdmin = user.platformRole === "super_admin";
  if (isPlatformSuperAdmin) {
    return { tenantId, tenant, membership: null, isPlatformSuperAdmin: true, permissions: [] };
  }

  const { data: membership, error: membershipError } = await supabase
    .from("tenant_members")
    .select("tenant_id, user_id, role, permissions, active")
    .eq("tenant_id", tenantId)
    .eq("user_id", user.id)
    .eq("active", true)
    .maybeSingle<MembershipRecord>();

  if (membershipError) throw unavailable();
  if (!membership || !isTenantRole(membership.role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Você não possui acesso a esta oficina." });
  }

  return {
    tenantId,
    tenant,
    membership,
    isPlatformSuperAdmin: false,
    permissions: resolveSupabasePermissions(membership.role, membership.permissions),
  };
}

export async function requireSupabaseTenantPermission(
  user: SupabaseSessionUser,
  tenantId: number,
  permission: Permission,
) {
  const access = await getSupabaseTenantAccess(user, tenantId);
  if (!hasSupabasePermission(access, permission)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Seu perfil não possui permissão para esta ação." });
  }
  return access;
}

export function assertSupabasePlatformSuperAdmin(user: SupabaseSessionUser) {
  if (user.platformRole !== "super_admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Apenas o Super Admin pode executar esta ação." });
  }
}
