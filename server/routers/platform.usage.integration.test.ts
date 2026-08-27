import type { TrpcContext } from "../_core/context";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ db: null as any, assertSuperAdmin: vi.fn() }));
vi.mock("../db", () => ({ getDb: vi.fn(async () => mocks.db), writeAuditLog: vi.fn(), createTenantForOwner: vi.fn(), listUserTenants: vi.fn() }));
vi.mock("../tenantAccess", () => ({ assertPlatformSuperAdmin: mocks.assertSuperAdmin, getTenantAccess: vi.fn(), requireTenantPermission: vi.fn() }));

import { platformRouter } from "./platform";

function chain(result: unknown) {
  const query: any = {};
  query.from = vi.fn(() => query);
  query.leftJoin = vi.fn(() => query);
  query.where = vi.fn(() => query);
  query.groupBy = vi.fn(() => query);
  query.orderBy = vi.fn(() => query);
  query.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
  return query;
}

function context(): TrpcContext {
  return { user: null, supabaseUser: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Super Admin", email: "admin@example.com", platformRole: "super_admin", accessToken: "test-access-token" }, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

describe("platform.usage — consumo global por tenant", () => {
  it("agrega somente contagens por tenant sem retornar dados operacionais internos", async () => {
    const select = vi.fn()
      .mockReturnValueOnce(chain([{ tenant: { id: 4, name: "Ruidão", planId: 21 }, plan: { id: 21, name: "Profissional", maxUsers: 10, maxCustomers: 500, active: true } }]))
      .mockReturnValueOnce(chain([{ tenantId: 4, total: 3 }]))
      .mockReturnValueOnce(chain([{ tenantId: 4, total: 120 }]));
    mocks.db = { select };

    await expect(platformRouter.createCaller(context()).usage()).resolves.toEqual([{ tenantId: 4, memberCount: 3, customerCount: 120, plan: { id: 21, name: "Profissional", maxUsers: 10, maxCustomers: 500, active: true } }]);
    expect(mocks.assertSuperAdmin).not.toHaveBeenCalled();
  });
});
