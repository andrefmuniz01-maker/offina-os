import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";

const mocks = vi.hoisted(() => ({ db: null as any, audit: vi.fn() }));
vi.mock("../db", () => ({ getDb: vi.fn(async () => mocks.db), writeAuditLog: mocks.audit }));
vi.mock("../tenantAccess", () => ({ getTenantAccess: vi.fn(), hasPermission: vi.fn(), requireTenantPermission: vi.fn() }));

import { quoteRouter } from "./quotes";

function query(result: unknown) {
  const builder: any = {};
  builder.from = vi.fn(() => builder);
  builder.innerJoin = vi.fn(() => builder);
  builder.leftJoin = vi.fn(() => builder);
  builder.where = vi.fn(() => builder);
  builder.limit = vi.fn(() => builder);
  builder.orderBy = vi.fn(() => builder);
  builder.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
  return builder;
}

function database(results: unknown[], updateResults: unknown[] = []) {
  const tx = {
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => updateResults.shift() ?? [{ affectedRows: 1 }]) })) })),
    insert: vi.fn(() => ({ values: vi.fn(async () => [{ insertId: 1 }]) })),
  };
  return { select: vi.fn(() => query(results.shift() ?? [])), update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => updateResults.shift() ?? [{ affectedRows: 1 }]) })) })), transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)) };
}

const publicContext: TrpcContext = { user: null, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] };
function row(status: "sent" | "viewed" = "sent", expiresAt = new Date("2026-12-01T00:00:00.000Z")) {
  return { quote: { id: 81, tenantId: 4, number: 12, status, publicTokenExpiresAt: expiresAt, viewedAt: null, total: "1250.00", validUntil: new Date("2026-12-01T00:00:00.000Z"), notes: null, terms: null }, customer: { name: "Marina" }, vehicle: { make: "BMW", model: "320i", modelYear: 2024 }, tenant: { active: true, name: "Oficina Centro" }, branding: null };
}

describe("quotes.publicView — auditoria de transições públicas", () => {
  beforeEach(() => mocks.audit.mockReset());

  it("registra a visualização pública e devolve o status atualizado sem dados de custo", async () => {
    mocks.db = database([ [row()], [{ id: 201, itemType: "product", description: "Peça", quantity: "1.000", unitPrice: "1250.00", discount: "0.00" }] ]);
    const caller = quoteRouter.createCaller(publicContext);

    await expect(caller.publicView({ token: "token-publico" })).resolves.toMatchObject({ quote: { number: 12, status: "viewed", total: 1250 }, items: [{ description: "Peça", total: 1250 }] });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 4, action: "quote.viewed_public", entityType: "quote", entityId: 81, before: { status: "sent" }, after: { status: "viewed" }, metadata: { source: "public_link" } }));
  });

  it("registra a expiração pública ao acessar link vencido antes de retornar o estado expirado", async () => {
    mocks.db = database([ [row("sent", new Date("2026-01-01T00:00:00.000Z"))] ]);
    const caller = quoteRouter.createCaller(publicContext);

    await expect(caller.publicView({ token: "token-publico" })).resolves.toEqual({ expired: true });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 4, action: "quote.expired_public", entityType: "quote", entityId: 81, before: { status: "sent" }, after: { status: "expired" }, metadata: { source: "public_link_expiration" } }));
  });

  it("não duplica evento nem auditoria quando outra sessão já marcou a visualização", async () => {
    const db = database([[row()], [{ id: 201, itemType: "product", description: "Peça", quantity: "1.000", unitPrice: "1250.00", discount: "0.00" }]], [[{ affectedRows: 0 }]]);
    mocks.db = db;
    const caller = quoteRouter.createCaller(publicContext);

    await expect(caller.publicView({ token: "token-publico" })).resolves.toMatchObject({ quote: { status: "sent" } });

    expect(db.transaction).toHaveBeenCalledOnce();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("não duplica auditoria quando outra sessão já expirou o orçamento", async () => {
    mocks.db = database([[row("sent", new Date("2026-01-01T00:00:00.000Z"))]], [[{ affectedRows: 0 }]]);
    const caller = quoteRouter.createCaller(publicContext);

    await expect(caller.publicView({ token: "token-publico" })).resolves.toEqual({ expired: true });

    expect(mocks.audit).not.toHaveBeenCalled();
  });
});
