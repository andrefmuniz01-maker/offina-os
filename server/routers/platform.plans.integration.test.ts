import type { TrpcContext } from "../_core/context";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ db: null as any, audit: vi.fn(), assertSuperAdmin: vi.fn() }));
vi.mock("../db", () => ({ getDb: vi.fn(async () => mocks.db), writeAuditLog: mocks.audit, createTenantForOwner: vi.fn(), listUserTenants: vi.fn() }));
vi.mock("../tenantAccess", () => ({ assertPlatformSuperAdmin: mocks.assertSuperAdmin, getTenantAccess: vi.fn(), requireTenantPermission: vi.fn() }));

import { platformRouter } from "./platform";

function chain(result: unknown) {
  const query: any = {};
  query.from = vi.fn(() => query);
  query.where = vi.fn(() => query);
  query.orderBy = vi.fn(() => query);
  query.limit = vi.fn(() => query);
  query.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
  return query;
}

function dbWith(selectResults: unknown[], insertId = 1, affectedRows = 1) {
  const inserts: unknown[] = [];
  const updates: unknown[] = [];
  return {
    select: vi.fn(() => chain(selectResults.shift() ?? [])),
    insert: vi.fn(() => ({ values: vi.fn(async (values: unknown) => { inserts.push(values); return [{ insertId }]; }) })),
    update: vi.fn(() => ({ set: vi.fn((values: unknown) => { updates.push(values); return { where: vi.fn(async () => [{ affectedRows }]) }; }) })),
    inserts: () => inserts,
    updates: () => updates,
  };
}

function context(): TrpcContext {
  return { user: { id: 7, openId: "platform-admin", role: "user", platformRole: "super_admin", name: "Super Admin", email: "admin@example.com", loginMethod: "manus", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

describe("platform.plans — gestão global auditável", () => {
  beforeEach(() => { mocks.audit.mockReset(); mocks.assertSuperAdmin.mockReset(); });

  it("cria um plano global único e registra a ação sem associá-la a tenant", async () => {
    const db = dbWith([[]], 21);
    mocks.db = db;
    const caller = platformRouter.createCaller(context());

    await expect(caller.plans.create({ code: "profissional", name: "Profissional", description: "Até dez usuários", maxUsers: 10, maxCustomers: 500, active: true })).resolves.toEqual({ id: 21 });
    expect(db.inserts()).toEqual([expect.objectContaining({ code: "profissional", name: "Profissional", maxUsers: 10, maxCustomers: 500, active: true })]);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: 7, action: "platform.plan_created", entityType: "plan", entityId: 21, after: expect.objectContaining({ code: "profissional", maxUsers: 10 }) }));
    expect(mocks.assertSuperAdmin).toHaveBeenCalled();
  });

  it("atualiza limites com concorrência protegida e preserva valores anteriores na auditoria", async () => {
    const previous = { id: 21, code: "profissional", name: "Profissional", description: "Anterior", maxUsers: 10, maxCustomers: 500, active: true, updatedAt: new Date("2026-08-26T12:00:00.000Z") };
    const db = dbWith([[previous]]);
    mocks.db = db;
    const caller = platformRouter.createCaller(context());

    await expect(caller.plans.update({ planId: 21, maxUsers: 15, active: false })).resolves.toEqual({ success: true });
    expect(db.updates()).toEqual([expect.objectContaining({ maxUsers: 15, active: false })]);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "platform.plan_updated", entityType: "plan", entityId: 21, before: expect.objectContaining({ maxUsers: 10, active: true }), after: { maxUsers: 15, active: false } }));
  });
});
