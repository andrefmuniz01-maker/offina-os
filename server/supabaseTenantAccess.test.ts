import { describe, expect, it } from "vitest";
import { assertSupabasePlatformSuperAdmin, hasSupabasePermission, resolveSupabasePermissions, type SupabaseTenantAccess } from "./supabaseTenantAccess";

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
    const attendant = resolveSupabasePermissions("attendant", ["financial.view", "financial.manage", "invalid.permission"]);
    const technician = resolveSupabasePermissions("technician", ["financial.view", "invalid.permission"]);

    expect(attendant).not.toContain("financial.view");
    expect(attendant).not.toContain("financial.manage");
    expect(technician).not.toContain("financial.view");
    expect(hasSupabasePermission(access(attendant), "quotes.manage")).toBe(true);
    expect(hasSupabasePermission(access(technician), "work_orders.execute")).toBe(true);
  });

  it("concede permissões completas globais somente ao Super Admin", () => {
    expect(hasSupabasePermission(access([], true), "financial.manage")).toBe(true);
    expect(hasSupabasePermission(access([], false), "financial.manage")).toBe(false);
  });

  it("não permite que um técnico receba controles administrativos via permissões customizadas", () => {
    const technician = resolveSupabasePermissions("technician", ["work_orders.manage", "tenant.manage", "team.manage"]);
    expect(technician).toEqual(["work_orders.execute"]);
    expect(hasSupabasePermission(access(technician), "tenant.manage")).toBe(false);
    expect(hasSupabasePermission(access(technician), "work_orders.manage")).toBe(false);
  });

  it("nega operações globais para uma identidade que não é Super Admin", () => {
    expect(() => assertSupabasePlatformSuperAdmin({
      id: "f3b9d977-1a0c-407a-b56b-7ca7337d9e88",
      name: "Atendente",
      email: "atendente@empresa.test",
      platformRole: "platform_user",
      accessToken: "teste",
    })).toThrow("Apenas o Super Admin");
  });
});
