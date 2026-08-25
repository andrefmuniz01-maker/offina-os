import type { TrpcContext } from "../_core/context";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: null as any,
  audit: vi.fn(),
  requirePermission: vi.fn(),
}));

vi.mock("../db", () => ({
  getDb: vi.fn(async () => mocks.db),
  writeAuditLog: mocks.audit,
}));

vi.mock("../tenantAccess", () => ({
  requireTenantPermission: mocks.requirePermission,
  getTenantAccess: vi.fn(),
  hasPermission: vi.fn(),
}));

import { quoteRequestRouter } from "./quotes";

function chain(result: unknown) {
  const query: any = {};
  query.from = vi.fn(() => query);
  query.innerJoin = vi.fn(() => query);
  query.leftJoin = vi.fn(() => query);
  query.where = vi.fn(() => query);
  query.limit = vi.fn(async () => result);
  query.orderBy = vi.fn(async () => result);
  return query;
}

function buildDb(selectResults: unknown[]) {
  const inserts: unknown[] = [];
  const tx = {
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => [{ affectedRows: 1 }]) })) })),
    insert: vi.fn(() => ({ values: vi.fn(async (value: unknown) => { inserts.push(value); return [{ insertId: 1 }]; }) })),
  };
  return {
    select: vi.fn(() => chain(selectResults.shift() ?? [])),
    transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)),
    inserts: () => inserts,
  };
}

function createContext(): TrpcContext {
  return {
    user: { id: 7, openId: "commercial-owner", role: "user", platformRole: "platform_user", name: "Gestor", email: "gestor@example.com", loginMethod: "manus", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const request = { id: 91, tenantId: 4, number: 18, status: "in_analysis", assignedToUserId: null };

describe("quoteRequests.updateStatus — integração tRPC simulada", () => {
  beforeEach(() => {
    mocks.audit.mockReset();
    mocks.requirePermission.mockResolvedValue({ permissions: ["quotes.manage"] });
  });

  it("bloqueia uma transição de solicitação que pula etapas do fluxo comercial", async () => {
    mocks.db = buildDb([[{ ...request, status: "new" }]]);
    const caller = quoteRequestRouter.createCaller(createContext());

    await expect(caller.updateStatus({ tenantId: 4, quoteRequestId: 91, status: "ready" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.db.transaction).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("bloqueia a atribuição a usuário que não é membro ativo do tenant", async () => {
    mocks.db = buildDb([[request], []]);
    const caller = quoteRequestRouter.createCaller(createContext());

    await expect(caller.updateStatus({ tenantId: 4, quoteRequestId: 91, status: "in_analysis", assignedToUserId: 888 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.db.transaction).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("atualiza a atribuição de membro ativo, registra a trilha e audita a mudança", async () => {
    mocks.db = buildDb([[request], [{ userId: 19, name: "Ana Técnica" }]]);
    const caller = quoteRequestRouter.createCaller(createContext());

    await expect(caller.updateStatus({ tenantId: 4, quoteRequestId: 91, status: "in_quoting", assignedToUserId: 19 })).resolves.toEqual({ success: true });
    expect(mocks.db.inserts()).toEqual(expect.arrayContaining([
      expect.objectContaining({ tenantId: 4, quoteRequestId: 91, type: "status_changed", actorUserId: 7, metadata: { from: "in_analysis", to: "in_quoting" } }),
      expect.objectContaining({ tenantId: 4, quoteRequestId: 91, type: "assigned", actorUserId: 7, metadata: { assignedToUserId: 19, assignedToUserName: "Ana Técnica" } }),
    ]));
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 4, actorUserId: 7, action: "quote_request.updated", entityId: 91, after: { status: "in_quoting", assignedToUserId: 19 } }));
  });
});
