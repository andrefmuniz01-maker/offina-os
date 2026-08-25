import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { tenantMembers, tenants, users, type TenantMember, type User } from "../drizzle/schema";
import { getDb } from "./db";

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

export type TenantAccess = {
  tenantId: number;
  tenant: typeof tenants.$inferSelect;
  membership: TenantMember | null;
  isPlatformSuperAdmin: boolean;
  permissions: Permission[];
};

export function hasPermission(access: TenantAccess, permission: Permission) {
  return access.isPlatformSuperAdmin || access.permissions.includes(permission);
}

export function resolvePermissions(role: TenantRole, custom: string[] = []) {
  return Array.from(new Set([...rolePermissions[role], ...custom])) as Permission[];
}

export async function getTenantAccess(user: User, tenantId: number): Promise<TenantAccess> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });

  const tenant = (await db.select().from(tenants).where(and(eq(tenants.id, tenantId), eq(tenants.active, true))).limit(1))[0];
  if (!tenant) throw new TRPCError({ code: "NOT_FOUND", message: "Oficina não encontrada ou inativa." });

  const isPlatformSuperAdmin = user.platformRole === "super_admin";
  const membership = (await db.select().from(tenantMembers)
    .where(and(eq(tenantMembers.tenantId, tenantId), eq(tenantMembers.userId, user.id), eq(tenantMembers.active, true)))
    .limit(1))[0] ?? null;

  if (!isPlatformSuperAdmin && !membership) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Você não possui acesso a esta oficina." });
  }

  const permissions = membership ? resolvePermissions(membership.role, membership.permissions ?? []) : [];

  return { tenantId, tenant, membership, isPlatformSuperAdmin, permissions };
}

export async function requireTenantPermission(user: User, tenantId: number, permission: Permission) {
  const access = await getTenantAccess(user, tenantId);
  if (!hasPermission(access, permission)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Seu perfil não possui permissão para esta ação." });
  }
  return access;
}

export function assertPlatformSuperAdmin(user: User) {
  if (user.platformRole !== "super_admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Apenas o Super Admin pode executar esta ação." });
  }
}
