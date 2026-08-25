import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";

const mocks = vi.hoisted(() => ({ db: null as any, audit: vi.fn() }));
vi.mock("../db", () => ({ getDb: vi.fn(async () => mocks.db), writeAuditLog: mocks.audit }));
vi.mock("../tenantAccess", () => ({ getTenantAccess: vi.fn(), hasPermission: vi.fn(), requireTenantPermission: vi.fn() }));

import { quoteRouter } from "./quotes";

function query(result: unknown) {
  const builder: any = { from: vi.fn(), where: vi.fn(), limit: vi.fn(), orderBy: vi.fn() };
  builder.from.mockReturnValue(builder); builder.where.mockReturnValue(builder); builder.limit.mockResolvedValue(result); builder.orderBy.mockResolvedValue(result);
  builder.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
  return builder;
}

function database(globalResults: unknown[], transactionResults: unknown[]) {
  const inserts: unknown[] = [];
  const tx = {
    select: vi.fn(() => query(transactionResults.shift() ?? [])),
    insert: vi.fn(() => ({ values: vi.fn(async (value: unknown) => { inserts.push(value); return [{ insertId: 1 }]; }) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => [{ affectedRows: 1 }]) })) })),
  };
  return { select: vi.fn(() => query(globalResults.shift() ?? [])), transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)), inserts: () => inserts };
}

const publicContext: TrpcContext = { user: null, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] };
const quote = { id: 81, tenantId: 4, quoteRequestId: 9, publicToken: "token-publico", publicTokenExpiresAt: new Date("2026-12-01T00:00:00.000Z"), status: "sent" };
const items = [
  { tenantId: 4, quoteId: 81, itemType: "product", productId: 55, quantity: "1.000", description: "Peça A" },
  { tenantId: 4, quoteId: 81, itemType: "product", productId: 55, quantity: "2.000", description: "Peça B" },
];

describe("quotes.publicDecision — integração tRPC simulada", () => {
  beforeEach(() => mocks.audit.mockReset());

  it("consolida produtos, reserva o saldo e aprova o orçamento sem depender de autenticação do cliente", async () => {
    mocks.db = database([[quote]], [items, [{ id: 7, tenantId: 4, productId: 55, physicalQuantity: "8.000", reservedQuantity: "2.000" }]]);
    const caller = quoteRouter.createCaller(publicContext);

    await expect(caller.publicDecision({ token: "token-publico", decision: "approved" })).resolves.toEqual({ status: "approved", idempotent: false });
    expect(mocks.db.inserts()).toEqual(expect.arrayContaining([
      expect.objectContaining({ tenantId: 4, quoteId: 81, productId: 55, quantity: "3.000" }),
      expect.objectContaining({ tenantId: 4, productId: 55, type: "reservation", referenceType: "quote", referenceId: 81, reservedDelta: "3.000" }),
    ]));
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 4, action: "quote.approved_public", entityId: 81 }));
  });

  it("interrompe a aprovação antes de inserir reservas quando o saldo disponível não cobre o plano", async () => {
    mocks.db = database([[quote]], [items, [{ id: 7, tenantId: 4, productId: 55, physicalQuantity: "4.000", reservedQuantity: "2.000" }]]);
    const caller = quoteRouter.createCaller(publicContext);

    await expect(caller.publicDecision({ token: "token-publico", decision: "approved" })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mocks.db.inserts()).toHaveLength(0);
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("não processa decisão por link vencido", async () => {
    mocks.db = database([[{ ...quote, publicTokenExpiresAt: new Date("2026-01-01T00:00:00.000Z") }]], []);
    const caller = quoteRouter.createCaller(publicContext);

    await expect(caller.publicDecision({ token: "token-publico", decision: "approved" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.db.transaction).not.toHaveBeenCalled();
  });
});
