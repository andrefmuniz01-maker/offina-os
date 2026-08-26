import type { TrpcContext } from "../_core/context";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ db: null as any, assertSuperAdmin: vi.fn() }));
vi.mock("../db", () => ({ getDb: vi.fn(async () => mocks.db), writeAuditLog: vi.fn(), createTenantForOwner: vi.fn(), listUserTenants: vi.fn() }));
vi.mock("../tenantAccess", () => ({ assertPlatformSuperAdmin: mocks.assertSuperAdmin, getTenantAccess: vi.fn(), requireTenantPermission: vi.fn() }));
vi.mock("../planLimits", () => ({ assertTenantPlanCapacity: vi.fn() }));

import { platformRouter } from "./platform";

function chain(result: unknown) {
  const query: any = {};
  query.from = vi.fn(() => query);
  query.where = vi.fn(() => query);
  query.groupBy = vi.fn(() => query);
  query.orderBy = vi.fn(() => query);
  query.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
  return query;
}

function context(): TrpcContext {
  return { user: { id: 7, openId: "platform-admin", role: "user", platformRole: "super_admin", name: "Super Admin", email: "admin@example.com", loginMethod: "manus", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

describe("platform.report — consolidação global por tenant", () => {
  beforeEach(() => mocks.assertSuperAdmin.mockReset());

  it("consolida uso e desempenho sem retornar dados operacionais individuais", async () => {
    mocks.db = { select: vi.fn()
      .mockReturnValueOnce(chain([{ id: 4, name: "Ruidão", slug: "ruidao", status: "active", active: true }, { id: 5, name: "Centro", slug: "centro", status: "active", active: true }]))
      .mockReturnValueOnce(chain([{ tenantId: 4, total: 3 }]))
      .mockReturnValueOnce(chain([{ tenantId: 4, total: 4, approved: 2 }, { tenantId: 5, total: 1, approved: 1 }]))
      .mockReturnValueOnce(chain([{ tenantId: 4, total: 2 }]))
      .mockReturnValueOnce(chain([{ tenantId: 4, amount: "725.50" }, { tenantId: 5, amount: "99.90" }])) };

    const result = await platformRouter.createCaller(context()).report({ from: new Date("2026-08-01T00:00:00.000Z"), to: new Date("2026-08-31T23:59:59.999Z") });
    expect(result.totals).toEqual({ tenants: 2, newCustomers: 3, quotes: 5, approvedQuotes: 3, deliveredWorkOrders: 2, receivedRevenue: 825.4 });
    expect(result.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: 4, newCustomers: 3, quotes: 4, approvedQuotes: 2, deliveredWorkOrders: 2, receivedRevenue: 725.5 }), expect.objectContaining({ id: 5, newCustomers: 0, quotes: 1, approvedQuotes: 1, deliveredWorkOrders: 0, receivedRevenue: 99.9 })]));
    expect(mocks.assertSuperAdmin).toHaveBeenCalled();
  });
});
