import type { TrpcContext } from "../_core/context";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: null as any,
  audit: vi.fn(),
  requirePermission: vi.fn(),
  hasPermission: vi.fn(),
}));

vi.mock("../db", () => ({ getDb: vi.fn(async () => mocks.db), writeAuditLog: mocks.audit }));
vi.mock("../tenantAccess", () => ({ getTenantAccess: vi.fn(), hasPermission: mocks.hasPermission, requireTenantPermission: mocks.requirePermission }));

import { inventoryRouter } from "./inventory";

function chain(result: unknown) {
  const query: any = {};
  query.from = vi.fn(() => query);
  query.where = vi.fn(() => query);
  query.orderBy = vi.fn(() => query);
  query.limit = vi.fn(async () => result);
  query.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
  return query;
}

function buildDb(transactionResults: unknown[], readResults: unknown[] = [], updateResults: unknown[] = []) {
  const updates: unknown[] = [];
  const inserts: unknown[] = [];
  const tx = {
    select: vi.fn(() => chain(transactionResults.shift() ?? [])),
    update: vi.fn(() => ({ set: vi.fn((value: unknown) => ({ where: vi.fn(async () => { updates.push(value); return updateResults.shift() ?? [{ affectedRows: 1 }]; }) })) })),
    insert: vi.fn(() => ({ values: vi.fn(async (value: unknown) => { inserts.push(value); return [{ insertId: 1 }]; }) })),
  };
  return { select: vi.fn(() => chain(readResults.shift() ?? [])), transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)), updates, inserts };
}

function createContext(): TrpcContext {
  return {
    user: { id: 7, openId: "inventory-manager", role: "user", platformRole: "platform_user", name: "Gestor", email: "gestor@example.com", loginMethod: "manus", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("inventory — auditoria de ajuste e recebimento", () => {
  beforeEach(() => {
    mocks.audit.mockReset();
    mocks.requirePermission.mockResolvedValue({ permissions: ["inventory.manage", "purchases.manage", "financial.manage"] });
    mocks.hasPermission.mockReturnValue(true);
  });

  it("registra o saldo físico anterior e posterior em um ajuste de estoque", async () => {
    mocks.db = buildDb([[{ balance: { id: 31, physicalQuantity: "10.000" } }]]);
    const caller = inventoryRouter.createCaller(createContext());

    await expect(caller.adjust({ tenantId: 4, productId: 12, quantityDelta: -2, notes: "Contagem física" })).resolves.toEqual({ success: true });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 4, action: "inventory.adjusted", entityId: 12, before: { physicalQuantity: 10 }, after: { physicalQuantity: 8 }, metadata: { quantityDelta: -2, notes: "Contagem física" } }));
  });

  it("interrompe o ajuste negativo quando o saldo mudou antes da atualização atômica", async () => {
    mocks.db = buildDb([[{ balance: { id: 31, physicalQuantity: "10.000" } }]], [], [[{ affectedRows: 0 }]]);
    const caller = inventoryRouter.createCaller(createContext());

    await expect(caller.adjust({ tenantId: 4, productId: 12, quantityDelta: -2, notes: "Contagem física" })).rejects.toMatchObject({ code: "CONFLICT" });

    expect(mocks.db.inserts).toEqual([]);
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("bloqueia movimentos quando o produto não pertence à oficina informada", async () => {
    mocks.db = buildDb([], [[]]);
    const caller = inventoryRouter.createCaller(createContext());

    await expect(caller.movements({ tenantId: 4, productId: 99 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("retorna movimentos apenas depois de validar o produto no tenant", async () => {
    const movement = { id: 71, tenantId: 4, productId: 12, type: "adjustment", quantity: "2.000" };
    mocks.db = buildDb([], [[{ id: 12 }], [movement]]);
    const caller = inventoryRouter.createCaller(createContext());

    await expect(caller.movements({ tenantId: 4, productId: 12 })).resolves.toEqual([movement]);
  });

  it("registra saldo e custo médio antes/depois ao receber compra no tenant", async () => {
    mocks.db = buildDb([
      [{ id: 91, status: "ordered" }],
      [{ id: 201, productId: 12, orderedQuantity: "5.000", receivedQuantity: "0.000", unitCost: "20.00" }],
      [{ id: 31, physicalQuantity: "10.000" }],
      [{ averageCost: "15.00" }],
      [{ id: 201, orderedQuantity: "5.000", receivedQuantity: "5.000" }],
    ]);
    const caller = inventoryRouter.createCaller(createContext());

    await expect(caller.purchaseOrders.receive({ tenantId: 4, purchaseOrderId: 91, items: [{ itemId: 201, receivedQuantity: 5 }] })).resolves.toEqual({ success: true });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 4, action: "purchase_order.received", entityId: 91, before: { status: "ordered" }, after: { status: "received", receivedItems: [expect.objectContaining({ itemId: 201, productId: 12, quantity: 5, previousPhysical: 10, nextPhysical: 15, previousAverageCost: 15, nextAverageCost: 16.67, currentCost: "20.00" })] } }));
  });
});
