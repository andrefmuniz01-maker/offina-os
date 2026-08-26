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

function buildDb(selectResults: unknown[], updateResults: unknown[] = []) {
  const inserts: unknown[] = [];
  const tx = {
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => updateResults.shift() ?? [{ affectedRows: 1 }]) })) })),
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

  it("bloqueia atualização de solicitação que não pertence ao tenant antes de criar eventos ou auditoria", async () => {
    mocks.db = buildDb([[]]);
    const caller = quoteRequestRouter.createCaller(createContext());

    await expect(caller.updateStatus({ tenantId: 4, quoteRequestId: 999, status: "in_analysis" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.db.transaction).not.toHaveBeenCalled();
    expect(mocks.db.inserts()).toHaveLength(0);
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

  it("registra responsável nulo na auditoria quando a atribuição é removida", async () => {
    mocks.db = buildDb([[{ ...request, assignedToUserId: 19 }]]);
    const caller = quoteRequestRouter.createCaller(createContext());

    await expect(caller.updateStatus({ tenantId: 4, quoteRequestId: 91, status: "in_analysis", assignedToUserId: null })).resolves.toEqual({ success: true });
    expect(mocks.db.inserts()).toEqual(expect.arrayContaining([
      expect.objectContaining({ tenantId: 4, quoteRequestId: 91, type: "assigned", actorUserId: 7, metadata: { assignedToUserId: null, assignedToUserName: null } }),
    ]));
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 4, actorUserId: 7, action: "quote_request.updated", entityId: 91, before: { status: "in_analysis", assignedToUserId: 19 }, after: { status: "in_analysis", assignedToUserId: null } }));
  });

  it("bloqueia eventos e auditoria quando outra sessão já mudou o status", async () => {
    mocks.db = buildDb([[request]], [[{ affectedRows: 0 }]]);
    const caller = quoteRequestRouter.createCaller(createContext());

    await expect(caller.updateStatus({ tenantId: 4, quoteRequestId: 91, status: "in_quoting" })).rejects.toMatchObject({ code: "CONFLICT" });

    expect(mocks.db.inserts()).toHaveLength(0);
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("bloqueia histórico de solicitação que não pertence ao tenant", async () => {
    mocks.db = buildDb([[]]);
    const caller = quoteRequestRouter.createCaller(createContext());

    await expect(caller.history({ tenantId: 4, quoteRequestId: 999 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("retorna eventos somente depois de confirmar a solicitação do tenant", async () => {
    const event = { id: 301, tenantId: 4, quoteRequestId: 91, type: "status_changed" };
    mocks.db = buildDb([[{ id: 91 }], [event]]);
    const caller = quoteRequestRouter.createCaller(createContext());

    await expect(caller.history({ tenantId: 4, quoteRequestId: 91 })).resolves.toEqual([event]);
  });
});

describe("quoteRequests.submitPublic — disponibilidade da oficina", () => {
  it("não expõe identidade ou catálogo quando o slug não corresponde a uma oficina ativa", async () => {
    mocks.db = buildDb([[]]);
    const caller = quoteRequestRouter.createCaller(createContext());

    await expect(caller.publicServices({ tenantSlug: "oficina-inativa" })).resolves.toBeNull();
  });

  it("recusa a solicitação antes de qualquer transação quando a oficina não estiver ativa", async () => {
    mocks.db = buildDb([[]]);
    const caller = quoteRequestRouter.createCaller(createContext());

    await expect(caller.submitPublic({ tenantSlug: "oficina-inativa", name: "Marina", whatsapp: "11999999999", make: "BMW", model: "320i", serviceLabel: "Downpipe" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.db.transaction).not.toHaveBeenCalled();
    expect(mocks.db.inserts()).toHaveLength(0);
  });
});
