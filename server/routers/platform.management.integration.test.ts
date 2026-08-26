import type { TrpcContext } from "../_core/context";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: null as any,
  audit: vi.fn(),
  createTenant: vi.fn(),
  assertSuperAdmin: vi.fn(),
  requirePermission: vi.fn(),
}));

vi.mock("../db", () => ({
  getDb: vi.fn(async () => mocks.db),
  writeAuditLog: mocks.audit,
  createTenantForOwner: mocks.createTenant,
  listUserTenants: vi.fn(),
}));

vi.mock("../tenantAccess", () => ({
  assertPlatformSuperAdmin: mocks.assertSuperAdmin,
  getTenantAccess: vi.fn(),
  requireTenantPermission: mocks.requirePermission,
}));

import { platformRouter, tenantRouter } from "./platform";

function chain(result: unknown) {
  const query: any = {};
  query.from = vi.fn(() => query);
  query.where = vi.fn(() => query);
  query.limit = vi.fn(() => query);
  query.offset = vi.fn(() => query);
  query.orderBy = vi.fn(() => query);
  query.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
  return query;
}

function buildDb(selectResults: unknown[], updateResults: unknown[] = []) {
  return {
    select: vi.fn(() => chain(selectResults.shift() ?? [])),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => updateResults.shift() ?? [{ affectedRows: 1 }]) })) })),
    insert: vi.fn(() => ({ values: vi.fn(() => ({ onDuplicateKeyUpdate: vi.fn(async () => [{ affectedRows: 1 }]) })) })),
  };
}

function createContext(): TrpcContext {
  return {
    user: { id: 7, openId: "platform-admin", role: "user", platformRole: "super_admin", name: "Super Admin", email: "admin@example.com", loginMethod: "manus", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("platform — ciclo administrativo de tenants", () => {
  beforeEach(() => {
    mocks.audit.mockReset();
    mocks.createTenant.mockReset();
    mocks.assertSuperAdmin.mockReset();
    mocks.requirePermission.mockResolvedValue({ permissions: ["team.manage"] });
  });

  it("cria tenant isolado após validar proprietário e identificador disponível", async () => {
    mocks.db = buildDb([[{ id: 7 }], []]);
    mocks.createTenant.mockResolvedValue(41);
    const caller = platformRouter.createCaller(createContext());

    await expect(caller.createTenant({ name: "Oficina Centro", slug: "oficina-centro" })).resolves.toEqual({ tenantId: 41 });
    expect(mocks.createTenant).toHaveBeenCalledWith(expect.objectContaining({ name: "Oficina Centro", slug: "oficina-centro", ownerUserId: 7, actorUserId: 7 }));
  });

  it("consolida as métricas globais para o painel de Super Admin", async () => {
    mocks.db = buildDb([[{ total: 3 }], [{ total: 2 }], [{ total: 12 }], [{ total: 8 }]]);
    const caller = platformRouter.createCaller(createContext());

    await expect(caller.metrics()).resolves.toEqual({ tenants: 3, activeTenants: 2, users: 12, activeMemberships: 8 });
  });

  it("altera a ativação de um tenant e deixa trilha de auditoria global", async () => {
    const tenant = { id: 41, status: "inactive", active: false, planId: null };
    mocks.db = buildDb([[tenant]]);
    const caller = platformRouter.createCaller(createContext());

    await expect(caller.updateTenant({ tenantId: 41, active: true, status: "active" })).resolves.toEqual({ success: true });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 41, actorUserId: 7, action: "platform.tenant_updated", entityType: "tenant", entityId: 41, after: { active: true, status: "active" } }));
  });

  it("registra papel e ativação anteriores e posteriores ao atualizar membro do tenant", async () => {
    mocks.db = buildDb([[{ role: "technician", active: true }]]);
    const caller = tenantRouter.createCaller(createContext());

    await expect(caller.members.updateRole({ tenantId: 41, userId: 19, role: "attendant", active: false })).resolves.toEqual({ success: true });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 41, actorUserId: 7, action: "tenant.member_updated", entityType: "tenant_member", entityId: 19,
      before: { role: "technician", active: true }, after: { role: "attendant", active: false },
    }));
  });

  it("bloqueia atualização de membro ausente no tenant antes de escrever ou auditar", async () => {
    mocks.db = buildDb([[]]);
    const caller = tenantRouter.createCaller(createContext());

    await expect(caller.members.updateRole({ tenantId: 41, userId: 999, role: "attendant" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("bloqueia auditoria quando outra sessão já alterou o papel ou a ativação do membro", async () => {
    mocks.db = buildDb([[{ role: "technician", active: true }]], [[{ affectedRows: 0 }]]);
    const caller = tenantRouter.createCaller(createContext());

    await expect(caller.members.updateRole({ tenantId: 41, userId: 19, role: "attendant", active: false })).rejects.toMatchObject({ code: "CONFLICT" });

    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("registra o estado anterior ao reativar um membro já vinculado à oficina", async () => {
    mocks.db = buildDb([[{ id: 19 }], [{ role: "technician", active: false }]]);
    const caller = tenantRouter.createCaller(createContext());

    await expect(caller.members.addExistingUser({ tenantId: 41, email: "tecnico@example.com", role: "attendant" })).resolves.toEqual({ success: true });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 41, actorUserId: 7, action: "tenant.member_added", entityType: "tenant_member", entityId: 19,
      before: { role: "technician", active: false }, after: { role: "attendant", active: true },
    }));
  });

  it("pagina a trilha de auditoria sem atravessar o tenant consultado", async () => {
    const newest = { id: 101, tenantId: 41, action: "quote.sent", entityType: "quote", entityId: 81, createdAt: new Date("2026-08-25T10:00:00.000Z") };
    const next = { id: 100, tenantId: 41, action: "inventory.adjusted", entityType: "product", entityId: 12, createdAt: new Date("2026-08-25T09:00:00.000Z") };
    mocks.db = buildDb([[newest, next]]);
    const caller = tenantRouter.createCaller(createContext());

    await expect(caller.audit.list({ tenantId: 41, page: 1, pageSize: 1 })).resolves.toEqual({ items: [newest], page: 1, pageSize: 1, hasMore: true });
  });
});
