import type { User } from "../drizzle/schema";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: null as any,
}));

vi.mock("./db", () => ({
  getDb: vi.fn(async () => mocks.db),
}));

import { getTenantAccess } from "./tenantAccess";

function chain(result: unknown) {
  const query: any = {};
  query.from = vi.fn(() => query);
  query.where = vi.fn(() => query);
  query.limit = vi.fn(async () => result);
  return query;
}

function createUser(platformRole: "platform_user" | "super_admin" = "platform_user"): User {
  return { id: 7, openId: "security-user", role: "user", platformRole, name: "Segurança", email: "seguranca@example.com", loginMethod: "manus", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };
}

describe("tenantAccess — tenant ativo e em estado operacional", () => {
  beforeEach(() => {
    mocks.db = { select: vi.fn(() => chain([])) };
  });

  it("bloqueia membro antes de consultar seu vínculo quando a oficina está suspensa", async () => {
    await expect(getTenantAccess(createUser(), 4)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.db.select).toHaveBeenCalledTimes(1);
  });

  it("aplica o mesmo bloqueio central ao Super Admin em operações internas da oficina", async () => {
    await expect(getTenantAccess(createUser("super_admin"), 4)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.db.select).toHaveBeenCalledTimes(1);
  });

  it("permite o acesso de membro quando a busca retorna tenant operacional e vínculo ativo", async () => {
    const tenant = { id: 4, name: "Oficina ativa", slug: "oficina-ativa", status: "active", active: true };
    const membership = { id: 9, tenantId: 4, userId: 7, role: "technician", permissions: [], active: true };
    const results = [[tenant], [membership]];
    mocks.db = { select: vi.fn(() => chain(results.shift() ?? [])) };

    const access = await getTenantAccess(createUser(), 4);
    expect(access.tenant).toEqual(tenant);
    expect(access.membership).toEqual(membership);
    expect(access.permissions).toEqual(["work_orders.execute"]);
  });
});
