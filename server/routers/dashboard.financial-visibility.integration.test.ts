import type { TrpcContext } from "../_core/context";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ db: null as any, requirePermission: vi.fn(), hasPermission: vi.fn() }));
vi.mock("../db", () => ({ getDb: vi.fn(async () => mocks.db), writeAuditLog: vi.fn() }));
vi.mock("../tenantAccess", () => ({ requireTenantPermission: mocks.requirePermission, hasPermission: mocks.hasPermission }));

import { dashboardRouter } from "./management";

function chain(result: unknown) {
  const query: any = {};
  query.from = vi.fn(() => query);
  query.where = vi.fn(() => query);
  query.leftJoin = vi.fn(() => query);
  query.innerJoin = vi.fn(() => query);
  query.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
  return query;
}

function createContext(): TrpcContext {
  return { user: { id: 9, openId: "report-reader", role: "user", platformRole: "platform_user", name: "Gestor", email: "gestor@example.com", loginMethod: "manus", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

describe("dashboard.overview — visibilidade financeira", () => {
  beforeEach(() => {
    mocks.requirePermission.mockResolvedValue({ permissions: ["reports.view"] });
    mocks.hasPermission.mockReturnValue(false);
  });

  it("mantém indicadores comerciais e operacionais, mas não consulta nem retorna despesas ou resultado sem financial.view", async () => {
    const select = vi.fn(() => chain([{ total: "100" }]));
    mocks.db = { select };
    const output = await dashboardRouter.createCaller(createContext()).overview({ tenantId: 4, referenceDate: new Date("2026-08-01T00:00:00.000Z") });

    expect(output).toEqual(expect.objectContaining({ sales: expect.any(Object), commercial: expect.any(Object), operation: expect.any(Object), inventory: expect.any(Object) }));
    expect(output).not.toHaveProperty("finance");
    expect(select).toHaveBeenCalledTimes(7);
  });
});
