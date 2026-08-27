import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./_core/supabase", () => ({
  createSupabaseClient: vi.fn(),
}));

import { createSupabaseClient } from "./_core/supabase";
import { assertSupabasePlatformSuperAdmin, getSupabaseTenantAccess, hasSupabasePermission, requireSupabaseTenantPermission, resolveSupabasePermissions, type SupabaseTenantAccess } from "./supabaseTenantAccess";

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
  const from = vi.fn();
  const tenantQuery = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
  const membershipQuery = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    tenantQuery.select.mockReturnValue(tenantQuery);
    tenantQuery.eq.mockReturnValue(tenantQuery);
    membershipQuery.select.mockReturnValue(membershipQuery);
    membershipQuery.eq.mockReturnValue(membershipQuery);
    tenantQuery.maybeSingle.mockResolvedValue({ data: { id: 12, name: "Oficina ativa", slug: "oficina-ativa", status: "active", active: true, is_demo: false, primary_owner_user_id: null }, error: null });
    membershipQuery.maybeSingle.mockResolvedValue({ data: null, error: null });
    from.mockImplementation((table: string) => table === "tenants" ? tenantQuery : membershipQuery);
    vi.mocked(createSupabaseClient).mockReturnValue({ from } as never);
  });

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

  it("nega acesso quando a identidade não possui vínculo ativo com a oficina", async () => {
    await expect(getSupabaseTenantAccess({
      id: "f3b9d977-1a0c-407a-b56b-7ca7337d9e88",
      name: "Atendente",
      email: "atendente@empresa.test",
      platformRole: "platform_user",
      accessToken: "teste",
    }, 12)).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(from).toHaveBeenCalledWith("tenant_members");
    expect(membershipQuery.eq).toHaveBeenCalledWith("tenant_id", 12);
    expect(membershipQuery.eq).toHaveBeenCalledWith("user_id", "f3b9d977-1a0c-407a-b56b-7ca7337d9e88");
    expect(membershipQuery.eq).toHaveBeenCalledWith("active", true);
  });

  it("nega a autorização consumida pelos procedures quando a identidade Supabase não possui membership", async () => {
    const user = {
      id: "f3b9d977-1a0c-407a-b56b-7ca7337d9e88",
      name: "Atendente",
      email: "atendente@empresa.test",
      platformRole: "platform_user" as const,
      accessToken: "teste",
    };

    await expect(requireSupabaseTenantPermission(user, 12, "quotes.manage")).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(membershipQuery.eq).toHaveBeenCalledWith("tenant_id", 12);
    expect(membershipQuery.eq).toHaveBeenCalledWith("user_id", user.id);
  });

  it.each([
    { active: false, status: "active" as const, label: "inativo" },
    { active: true, status: "suspended" as const, label: "suspenso" },
  ])("nega tenant $label antes de consultar vínculo ou permissões", async ({ active, status }) => {
    tenantQuery.maybeSingle.mockResolvedValueOnce({
      data: { id: 12, name: "Oficina indisponível", slug: "oficina-indisponivel", status, active, is_demo: false, primary_owner_user_id: null },
      error: null,
    });

    await expect(getSupabaseTenantAccess({
      id: "f3b9d977-1a0c-407a-b56b-7ca7337d9e88",
      name: "Atendente",
      email: "atendente@empresa.test",
      platformRole: "platform_user",
      accessToken: "teste",
    }, 12)).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(from).not.toHaveBeenCalledWith("tenant_members");
  });
});
