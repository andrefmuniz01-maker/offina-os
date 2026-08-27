import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { tenants, type User } from "../drizzle/schema";

vi.mock("./db", () => ({
  getDb: vi.fn(),
}));

import { getDb } from "./db";
import { getTenantAccess, requireTenantPermission } from "./tenantAccess";

const tenant = {
  id: 9,
  name: "Oficina Protegida",
  slug: "oficina-protegida",
  active: true,
  status: "active",
} as unknown as typeof tenants.$inferSelect;

const regularUser: User = {
  id: 12,
  openId: "regular-user",
  name: "Usuário Regular",
  email: "regular@example.com",
  loginMethod: "email",
  role: "user",
  platformRole: "platform_user",
  createdAt: new Date("2026-08-26T00:00:00.000Z"),
  updatedAt: new Date("2026-08-26T00:00:00.000Z"),
  lastSignedIn: new Date("2026-08-26T00:00:00.000Z"),
};

function mockDbWithLimits(...rows: unknown[][]) {
  const limit = vi.fn();
  rows.forEach(row => limit.mockResolvedValueOnce(row));
  vi.mocked(getDb).mockResolvedValue({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit })),
      })),
    })),
  } as never);
}

describe("autorização de tenant no backend", () => {
  beforeEach(() => vi.clearAllMocks());

  it("nega usuário autenticado sem membership ativo no tenant solicitado", async () => {
    mockDbWithLimits([tenant], []);

    await expect(getTenantAccess(regularUser, tenant.id)).rejects.toMatchObject<Partial<TRPCError>>({
      code: "FORBIDDEN",
    });
  });

  it("nega ao técnico uma permissão financeira fora do seu papel", async () => {
    mockDbWithLimits([tenant], [{ tenantId: tenant.id, userId: regularUser.id, role: "technician", active: true, permissions: null }]);

    await expect(requireTenantPermission(regularUser, tenant.id, "financial.view")).rejects.toMatchObject<Partial<TRPCError>>({
      code: "FORBIDDEN",
    });
  });

  it("permite ao Super Admin consultar tenant ativo mesmo sem membership local", async () => {
    mockDbWithLimits([tenant], []);

    const access = await getTenantAccess({ ...regularUser, platformRole: "super_admin" }, tenant.id);

    expect(access.isPlatformSuperAdmin).toBe(true);
    expect(access.membership).toBeNull();
  });
});
