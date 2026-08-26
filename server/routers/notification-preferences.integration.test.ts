import type { TrpcContext } from "../_core/context";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ db: null as any, audit: vi.fn(), requirePermission: vi.fn() }));
vi.mock("../db", () => ({ getDb: vi.fn(async () => mocks.db), writeAuditLog: mocks.audit }));
vi.mock("../tenantAccess", () => ({ requireTenantPermission: mocks.requirePermission, hasPermission: vi.fn() }));

import { notificationRouter } from "./management";

function chain(result: unknown) {
  const query: any = {};
  query.from = vi.fn(() => query);
  query.leftJoin = vi.fn(() => query);
  query.where = vi.fn(() => query);
  query.orderBy = vi.fn(() => query);
  query.limit = vi.fn(() => query);
  query.offset = vi.fn(async () => result);
  query.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
  return query;
}

function context(): TrpcContext {
  return { user: { id: 7, openId: "operator", role: "user", platformRole: "platform_user", name: "Gestor", email: "gestor@example.com", loginMethod: "manus", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

describe("notification preferences — integração tRPC", () => {
  beforeEach(() => { mocks.audit.mockReset(); mocks.requirePermission.mockResolvedValue({ permissions: ["customers.manage"] }); });

  it("faz upsert das preferências internas no tenant do usuário e mantém e-mail desativado", async () => {
    const values = vi.fn(() => ({ onDuplicateKeyUpdate: vi.fn(async () => [{ affectedRows: 1 }]) }));
    mocks.db = { select: vi.fn(() => chain([{ tenantId: 4, userId: 7, inAppEnabled: false, enabledTypes: ["quote.sent"] }])), insert: vi.fn(() => ({ values })) };

    await expect(notificationRouter.createCaller(context()).updatePreferences({ tenantId: 4, inAppEnabled: true, enabledTypes: ["quote_request.created", "quote_request.created", "post_sale.suggested"] })).resolves.toEqual({ success: true });
    expect(values).toHaveBeenCalledWith({ tenantId: 4, userId: 7, inAppEnabled: true, emailEnabled: false, enabledTypes: ["quote_request.created", "post_sale.suggested"] });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 4, actorUserId: 7, action: "notification_preferences.updated", before: { inAppEnabled: false, enabledTypes: ["quote.sent"] }, after: { inAppEnabled: true, enabledTypes: ["quote_request.created", "post_sale.suggested"] } }));
  });

  it("não retorna avisos internos quando o próprio usuário pausou a visualização no tenant", async () => {
    const select = vi.fn(() => chain([{ tenantId: 4, userId: 7, inAppEnabled: false, enabledTypes: [] }]));
    mocks.db = { select };

    await expect(notificationRouter.createCaller(context()).listMine({ tenantId: 4 })).resolves.toEqual({ items: [], page: 1, pageSize: 30, hasMore: false });
    expect(select).toHaveBeenCalledTimes(1);
  });

  it("pagina somente avisos visíveis ao usuário dentro do tenant", async () => {
    const preference = { tenantId: 4, userId: 7, inAppEnabled: true, enabledTypes: [] };
    const rows = [
      { notification: { id: 31, tenantId: 4, title: "Estoque crítico", body: "Revisar saldo" }, customer: null, vehicle: null },
      { notification: { id: 30, tenantId: 4, title: "Orçamento pronto", body: "Enviar proposta" }, customer: null, vehicle: null },
      { notification: { id: 29, tenantId: 4, title: "Compra recebida", body: "Conferir itens" }, customer: null, vehicle: null },
    ];
    const select = vi.fn().mockReturnValueOnce(chain([preference])).mockReturnValueOnce(chain(rows));
    mocks.db = { select };

    await expect(notificationRouter.createCaller(context()).listMine({ tenantId: 4, page: 2, pageSize: 2 })).resolves.toEqual({ items: rows.slice(0, 2), page: 2, pageSize: 2, hasMore: true });
    expect(mocks.requirePermission).toHaveBeenCalledWith(expect.anything(), 4, "customers.manage");
  });

  it("audita a leitura confirmada sem incluir o conteúdo da notificação", async () => {
    const where = vi.fn(async () => [{ affectedRows: 1 }]);
    const set = vi.fn(() => ({ where }));
    mocks.db = { select: vi.fn(() => chain([{ id: 31, readAt: null }])), update: vi.fn(() => ({ set })) };

    await expect(notificationRouter.createCaller(context()).markRead({ tenantId: 4, notificationId: 31 })).resolves.toEqual({ success: true, idempotent: false });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 4, actorUserId: 7, action: "notification.read", entityType: "notification", entityId: 31, before: { readAt: null }, metadata: { source: "in_app" } }));
    expect(mocks.audit.mock.calls[0][0]).not.toHaveProperty("body");
    expect(mocks.audit.mock.calls[0][0]).not.toHaveProperty("title");
  });
});
