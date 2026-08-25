import { describe, expect, it } from "vitest";
import { hasPermission, resolvePermissions, type TenantAccess } from "./tenantAccess";

const baseAccess: TenantAccess = {
  tenantId: 9,
  tenant: { id: 9, name: "Oficina A", slug: "oficina-a", status: "active", planId: null, primaryOwnerUserId: null, active: true, createdAt: new Date(), updatedAt: new Date() },
  membership: null,
  isPlatformSuperAdmin: false,
  permissions: [],
};

describe("permissões por perfil de oficina", () => {
  it("não expõe dados financeiros ao atendente por padrão", () => {
    const permissions = resolvePermissions("attendant");
    expect(permissions).toContain("quotes.manage");
    expect(permissions).not.toContain("financial.view");
    expect(hasPermission({ ...baseAccess, permissions }, "financial.view")).toBe(false);
  });

  it("permite execução de OS ao técnico sem liberar gerenciamento financeiro", () => {
    const permissions = resolvePermissions("technician");
    expect(hasPermission({ ...baseAccess, permissions }, "work_orders.execute")).toBe(true);
    expect(hasPermission({ ...baseAccess, permissions }, "financial.manage")).toBe(false);
  });

  it("mantém o Super Admin com autorização global", () => {
    expect(hasPermission({ ...baseAccess, isPlatformSuperAdmin: true }, "tenant.manage")).toBe(true);
    expect(hasPermission({ ...baseAccess, isPlatformSuperAdmin: true }, "financial.manage")).toBe(true);
  });
});
