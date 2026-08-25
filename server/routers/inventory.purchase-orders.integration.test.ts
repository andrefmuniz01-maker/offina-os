import type { TrpcContext } from "../_core/context";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: null as any,
  audit: vi.fn(),
  requirePermission: vi.fn(),
  hasPermission: vi.fn(),
}));

vi.mock("../db", () => ({
  getDb: vi.fn(async () => mocks.db),
  writeAuditLog: mocks.audit,
}));

vi.mock("../tenantAccess", () => ({
  getTenantAccess: vi.fn(),
  hasPermission: mocks.hasPermission,
  requireTenantPermission: mocks.requirePermission,
}));

import { inventoryRouter } from "./inventory";

function chain(result: unknown) {
  const query: any = {};
  query.from = vi.fn(() => query);
  query.leftJoin = vi.fn(() => query);
  query.where = vi.fn(() => query);
  query.limit = vi.fn(() => query);
  query.offset = vi.fn(() => query);
  query.orderBy = vi.fn(() => query);
  query.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
  return query;
}

function buildDb(selectResults: unknown[], transactionResults: unknown[] = []) {
  const inserts: unknown[] = [];
  const tx = {
    select: vi.fn(() => chain(transactionResults.shift() ?? [])),
    insert: vi.fn(() => ({ values: vi.fn(async (value: unknown) => { inserts.push(value); return [{ insertId: 71 }]; }) })),
  };
  return {
    select: vi.fn(() => chain(selectResults.shift() ?? [])),
    transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)),
    inserts: () => inserts,
  };
}

function createContext(): TrpcContext {
  return {
    user: { id: 7, openId: "purchase-manager", role: "user", platformRole: "platform_user", name: "Gestor", email: "gestor@example.com", loginMethod: "manus", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("inventory.purchaseOrders.create — isolamento de fornecedor", () => {
  beforeEach(() => {
    mocks.audit.mockReset();
    mocks.requirePermission.mockResolvedValue({ permissions: ["purchases.manage", "financial.manage"] });
    mocks.hasPermission.mockReturnValue(true);
  });

  it("bloqueia fornecedor que não pertence ao tenant do pedido", async () => {
    mocks.db = buildDb([[]]);
    const caller = inventoryRouter.createCaller(createContext());

    await expect(caller.purchaseOrders.create({ tenantId: 4, supplierId: 88, items: [{ productId: 12, quantity: 1, unitCost: 25 }] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.db.transaction).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("aceita fornecedor e produto do próprio tenant e persiste o vínculo no pedido", async () => {
    mocks.db = buildDb([[{ id: 88 }], [{ id: 12 }]], [[{ value: 43 }]]);
    const caller = inventoryRouter.createCaller(createContext());

    await expect(caller.purchaseOrders.create({ tenantId: 4, supplierId: 88, notes: "Reposição programada", items: [{ productId: 12, quantity: 2, unitCost: 25 }] })).resolves.toEqual({ id: 71, number: 43 });
    expect(mocks.db.inserts()).toEqual(expect.arrayContaining([
      expect.objectContaining({ tenantId: 4, number: 43, supplierId: 88, notes: "Reposição programada", createdByUserId: 7 }),
      expect.arrayContaining([expect.objectContaining({ tenantId: 4, purchaseOrderId: 71, productId: 12, orderedQuantity: "2.000", unitCost: "25.00" })]),
    ]));
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 4, actorUserId: 7, action: "purchase_order.created", entityId: 71 }));
  });

  it("pagina pedidos do tenant e oculta custo unitário quando o perfil não pode ver financeiro", async () => {
    mocks.hasPermission.mockImplementation((_access: unknown, permission: string) => permission === "purchases.manage");
    const order = { id: 61, tenantId: 4, number: 12, status: "ordered", createdAt: new Date("2026-08-25T12:00:00.000Z") };
    const item = { id: 71, tenantId: 4, purchaseOrderId: 61, productId: 12, orderedQuantity: "2.000", receivedQuantity: "0.000", unitCost: "45.00" };
    mocks.db = buildDb([[{ order, supplier: null }], [item]]);
    const caller = inventoryRouter.createCaller(createContext());

    await expect(caller.purchaseOrders.list({ tenantId: 4, status: "ordered", page: 1, pageSize: 10 })).resolves.toEqual({
      items: [{ order, supplier: null, items: [{ id: 71, tenantId: 4, purchaseOrderId: 61, productId: 12, orderedQuantity: "2.000", receivedQuantity: "0.000" }] }],
      page: 1, pageSize: 10, hasMore: false,
    });
  });

  it("mantém custo unitário apenas na listagem de perfil com permissão financeira", async () => {
    mocks.hasPermission.mockReturnValue(true);
    const order = { id: 62, tenantId: 4, number: 13, status: "received", createdAt: new Date("2026-08-25T12:00:00.000Z") };
    const item = { id: 72, tenantId: 4, purchaseOrderId: 62, productId: 12, orderedQuantity: "2.000", receivedQuantity: "2.000", unitCost: "45.00" };
    mocks.db = buildDb([[{ order, supplier: null }], [item]]);
    const caller = inventoryRouter.createCaller(createContext());

    await expect(caller.purchaseOrders.list({ tenantId: 4, page: 1, pageSize: 10 })).resolves.toEqual({
      items: [{ order, supplier: null, items: [item] }], page: 1, pageSize: 10, hasMore: false,
    });
  });
});
