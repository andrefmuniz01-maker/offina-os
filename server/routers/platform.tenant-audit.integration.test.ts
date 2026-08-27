import type { TrpcContext } from "../_core/context";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ db: null as any, assertSuperAdmin: vi.fn() }));
vi.mock("../db", () => ({ getDb: vi.fn(async () => mocks.db), writeAuditLog: vi.fn(), createTenantForOwner: vi.fn(), listUserTenants: vi.fn() }));
vi.mock("../tenantAccess", () => ({ assertPlatformSuperAdmin: mocks.assertSuperAdmin, getTenantAccess: vi.fn(), requireTenantPermission: vi.fn() }));

import { platformRouter } from "./platform";

function chain(result: unknown) {
  const query: any = {};
  query.from = vi.fn(() => query);
  query.where = vi.fn(() => query);
  query.orderBy = vi.fn(() => query);
  query.limit = vi.fn(() => query);
  query.offset = vi.fn(async () => result);
  query.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
  return query;
}

function context(): TrpcContext {
  return { user: null, supabaseUser: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Super Admin", email: "admin@example.com", platformRole: "super_admin", accessToken: "test-access-token" }, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

describe("platform.tenantAudit — suporte global restrito a metadados", () => {
  it("retorna eventos paginados de tenant existente sem before, after ou metadata", async () => {
    const rows = [
      { id: 11, actorUserId: 7, action: "quote.sent", entityType: "quote", entityId: 44, createdAt: new Date("2026-08-26T10:00:00.000Z") },
      { id: 10, actorUserId: 7, action: "inventory.adjusted", entityType: "inventory_movement", entityId: 30, createdAt: new Date("2026-08-26T09:00:00.000Z") },
      { id: 9, actorUserId: 7, action: "tenant.settings_updated", entityType: "tenant_settings", entityId: 4, createdAt: new Date("2026-08-26T08:00:00.000Z") },
    ];
    const select = vi.fn().mockReturnValueOnce(chain([{ id: 4 }])).mockReturnValueOnce(chain(rows));
    mocks.db = { select };

    const output = await platformRouter.createCaller(context()).tenantAudit({ tenantId: 4, search: "quote", page: 2, pageSize: 2 });

    expect(output).toEqual({ items: rows.slice(0, 2), page: 2, pageSize: 2, hasMore: true });
    expect(output.items[0]).not.toHaveProperty("before");
    expect(output.items[0]).not.toHaveProperty("after");
    expect(output.items[0]).not.toHaveProperty("metadata");
    expect(mocks.assertSuperAdmin).not.toHaveBeenCalled();
  });
});
