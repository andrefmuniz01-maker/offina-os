import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";

const mocks = vi.hoisted(() => ({ db: null as any, audit: vi.fn(), requirePermission: vi.fn() }));
vi.mock("../db", () => ({ getDb: vi.fn(async () => mocks.db), writeAuditLog: mocks.audit }));
vi.mock("../tenantAccess", () => ({ getTenantAccess: vi.fn(), hasPermission: vi.fn(), requireTenantPermission: mocks.requirePermission }));

import { quoteRouter } from "./quotes";

function query(result: unknown) {
  const builder: any = {};
  builder.from = vi.fn(() => builder);
  builder.innerJoin = vi.fn(() => builder);
  builder.leftJoin = vi.fn(() => builder);
  builder.where = vi.fn(() => builder);
  builder.limit = vi.fn(async () => result);
  builder.orderBy = vi.fn(async () => result);
  builder.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
  return builder;
}

function database(results: unknown[], updateResults: unknown[] = []) {
  const tx = {
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => updateResults.shift() ?? [{ affectedRows: 1 }]) })) })),
    insert: vi.fn(() => ({ values: vi.fn(async () => [{ insertId: 1 }] ) })),
  };
  return { select: vi.fn(() => query(results.shift() ?? [])), transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)), tx };
}

function context(): TrpcContext {
  return { user: { id: 7, openId: "quote-manager", role: "user", platformRole: "platform_user", name: "Gestor", email: "gestor@example.com", loginMethod: "manus", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

describe("quotes.send — auditoria da transição comercial", () => {
  beforeEach(() => {
    mocks.audit.mockReset();
    mocks.requirePermission.mockResolvedValue({ permissions: ["quotes.manage"] });
  });

  it("registra o status pronto antes do envio manual e o status enviado depois da transação", async () => {
    mocks.db = database([
      [{ quote: { id: 81, tenantId: 4, quoteRequestId: 9, status: "ready", publicToken: "token-publico", total: "1250.00" }, customer: { name: "Marina" }, vehicle: { make: "BMW", model: "320i" } }],
      [{ quoteMessageTemplate: null }],
      [{ name: "Oficina Centro" }],
    ]);
    const caller = quoteRouter.createCaller(context());

    await expect(caller.send({ tenantId: 4, quoteId: 81 })).resolves.toMatchObject({ publicUrl: "/orcamento/token-publico" });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 4, actorUserId: 7, action: "quote.sent", entityType: "quote", entityId: 81,
      before: { status: "ready" }, after: { status: "sent" }, metadata: { channel: "manual_whatsapp_preparation" },
    }));
  });

  it("bloqueia o evento de envio quando outra sessão já mudou o status", async () => {
    mocks.db = database([
      [{ quote: { id: 81, tenantId: 4, quoteRequestId: 9, status: "ready", publicToken: "token-publico", total: "1250.00" }, customer: { name: "Marina" }, vehicle: { make: "BMW", model: "320i" } }],
    ], [[{ affectedRows: 0 }]]);
    const caller = quoteRouter.createCaller(context());

    await expect(caller.send({ tenantId: 4, quoteId: 81 })).rejects.toMatchObject({ code: "CONFLICT" });

    expect(mocks.db.tx.insert).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});
