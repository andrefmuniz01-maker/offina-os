import type { TrpcContext } from "../_core/context";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ db: null as any, audit: vi.fn(), assertSuperAdmin: vi.fn() }));
vi.mock("../db", () => ({ getDb: vi.fn(async () => mocks.db), writeAuditLog: mocks.audit, createTenantForOwner: vi.fn(), listUserTenants: vi.fn() }));
vi.mock("../tenantAccess", () => ({ assertPlatformSuperAdmin: mocks.assertSuperAdmin, getTenantAccess: vi.fn(), requireTenantPermission: vi.fn() }));
vi.mock("../planLimits", () => ({ assertTenantPlanCapacity: vi.fn() }));

import { platformRouter } from "./platform";

function chain(result: unknown) {
  const query: any = {};
  query.from = vi.fn(() => query);
  query.innerJoin = vi.fn(() => query);
  query.where = vi.fn(() => query);
  query.orderBy = vi.fn(() => query);
  query.limit = vi.fn(() => query);
  query.offset = vi.fn(async () => result);
  query.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
  return query;
}

function context(): TrpcContext {
  return { user: { id: 7, openId: "platform-admin", role: "user", platformRole: "super_admin", name: "Super Admin", email: "admin@example.com", loginMethod: "manus", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

function readContext(): TrpcContext {
  return { user: null, supabaseUser: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Super Admin", email: "admin@example.com", platformRole: "super_admin", accessToken: "test-access-token" }, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

describe("platform.users — gestão global auditável", () => {
  beforeEach(() => { mocks.audit.mockReset(); mocks.assertSuperAdmin.mockReset(); });

  it("lista dados mínimos de usuários com seus vínculos por tenant", async () => {
    const userRows = [{ id: 12, name: "Atendente", email: "atendente@example.com", platformRole: "platform_user", lastSignedIn: new Date("2026-08-26T10:00:00.000Z") }];
    const membershipRows = [{ membership: { tenantId: 4, userId: 12, role: "attendant", active: true }, tenant: { id: 4, name: "Ruidão", slug: "ruidao", primaryOwnerUserId: 7 } }];
    const select = vi.fn().mockReturnValueOnce(chain(userRows)).mockReturnValueOnce(chain(membershipRows));
    mocks.db = { select };

    await expect(platformRouter.createCaller(readContext()).users.list({ page: 1, pageSize: 10 })).resolves.toEqual({ items: [{ ...userRows[0], memberships: [{ tenantId: 4, tenantName: "Ruidão", tenantSlug: "ruidao", role: "attendant", active: true, primaryOwner: false }] }], page: 1, pageSize: 10, hasMore: false });
    expect(mocks.assertSuperAdmin).not.toHaveBeenCalled();
  });

  it("atualiza vínculo não proprietário com auditoria e bloqueia o proprietário primário", async () => {
    const select = vi.fn().mockReturnValueOnce(chain([{ id: 4, primaryOwnerUserId: 7 }])).mockReturnValueOnce(chain([{ role: "attendant", active: true }]));
    const set = vi.fn(() => ({ where: vi.fn(async () => [{ affectedRows: 1 }]) }));
    mocks.db = { select, update: vi.fn(() => ({ set })) };
    const caller = platformRouter.createCaller(context());

    await expect(caller.users.updateMembership({ tenantId: 4, userId: 12, role: "technician", active: false })).resolves.toEqual({ success: true });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 4, action: "platform.user_membership_updated", entityType: "tenant_member", entityId: 12, before: { role: "attendant", active: true }, after: { role: "technician", active: false } }));

    mocks.db = { select: vi.fn(() => chain([{ id: 4, primaryOwnerUserId: 7 }])) };
    await expect(caller.users.updateMembership({ tenantId: 4, userId: 7, role: "owner", active: true })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("associa usuário existente a tenant com papel inicial não proprietário e audita o vínculo", async () => {
    const select = vi.fn().mockReturnValueOnce(chain([{ id: 4 }])).mockReturnValueOnce(chain([{ id: 12 }])).mockReturnValueOnce(chain([]));
    const onDuplicateKeyUpdate = vi.fn(async () => [{ affectedRows: 1 }]);
    const values = vi.fn(() => ({ onDuplicateKeyUpdate }));
    mocks.db = { select, insert: vi.fn(() => ({ values })) };

    await expect(platformRouter.createCaller(context()).users.addMembership({ tenantId: 4, userId: 12, role: "attendant" })).resolves.toEqual({ success: true });
    expect(values).toHaveBeenCalledWith({ tenantId: 4, userId: 12, role: "attendant", active: true });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 4, action: "platform.user_membership_added", entityType: "tenant_member", entityId: 12, after: { role: "attendant", active: true } }));
  });
});
