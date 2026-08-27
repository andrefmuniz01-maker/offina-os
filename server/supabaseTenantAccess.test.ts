import { describe, expect, it } from "vitest";
import { hasSupabasePermission, resolveSupabasePermissions, type SupabaseTenantAccess } from "./supabaseTenantAccess";

const access = (permissions: SupabaseTenantAccess["permissions"], isPlatformSuperAdmin = false): SupabaseTenantAccess => ({
  tenantId: 1,
  tenant: {
    id: 1,
    name: "Oficina Demonstração",
    slug: "oficina-demo",
    status: "active",
    active: true,
    is_demo: true,
    primary_owner_user_id: null,
  },
  membership: null,
  isPlatformSuperAdmin,
  permissions,
});

describe("permissões de tenant no Supabase", () => {
  it("mantém custo e financeiro restritos para atendente e técnico", () => {
    const attendant = resolveSupabasePermissions("attendant", ["financial.view", "invalid.permission"]);
    const technician = resolveSupabasePermissions("technician", ["invalid.permission"]);

    expect(attendant).not.toContain("financial.view");
    expect(technician).not.toContain("financial.view");
    expect(hasSupabasePermission(access(attendant), "quotes.manage")).toBe(true);
    expect(hasSupabasePermission(access(technician), "work_orders.execute")).toBe(true);
  });

  it("concede permissões completas globais somente ao Super Admin", () => {
    expect(hasSupabasePermission(access([], true), "financial.manage")).toBe(true);
    expect(hasSupabasePermission(access([], false), "financial.manage")).toBe(false);
  });
});
