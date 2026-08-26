import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";

const mocks = vi.hoisted(() => ({ db: null as any, audit: vi.fn(), access: vi.fn(), hasPermission: vi.fn() }));
vi.mock("../db", () => ({ getDb: vi.fn(async () => mocks.db), writeAuditLog: mocks.audit }));
vi.mock("../tenantAccess", () => ({ getTenantAccess: mocks.access, hasPermission: mocks.hasPermission, requireTenantPermission: vi.fn() }));

import { workOrderRouter } from "./operations";

function chain(result: unknown) {
  const query: any = { from: vi.fn(), where: vi.fn(), limit: vi.fn(), orderBy: vi.fn() };
  query.from.mockReturnValue(query); query.where.mockReturnValue(query); query.limit.mockResolvedValue(result); query.orderBy.mockResolvedValue(result);
  query.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
  return query;
}

function dbWith(selectResults: unknown[], updateResults: unknown[] = []) {
  const updates: unknown[] = []; const inserts: unknown[] = [];
  const select = vi.fn(() => chain(selectResults.shift() ?? []));
  const tx = { select, update: vi.fn(() => ({ set: vi.fn((value: unknown) => ({ where: vi.fn(async () => { updates.push(value); return updateResults.shift() ?? [{ affectedRows: 1 }]; }) })) })), insert: vi.fn(() => ({ values: vi.fn(async (value: unknown) => { inserts.push(value); return [{ insertId: 1 }]; }) })) };
  return { transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)), updates: () => updates, inserts: () => inserts };
}

function context(): TrpcContext { return { user: { id: 5, openId: "tech", role: "user", platformRole: "platform_user", name: "Técnico", email: "tech@example.com", loginMethod: "manus", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] }; }

describe("workOrders.consumeProduct — integração tRPC simulada", () => {
  beforeEach(() => {
    mocks.audit.mockReset();
    mocks.access.mockResolvedValue({ membership: { role: "technician" }, isPlatformSuperAdmin: false });
    mocks.hasPermission.mockImplementation((_access: unknown, permission: string) => permission === "work_orders.execute");
  });

  it("baixa estoque e reserva, registra consumo e atualiza custo real da OS do técnico atribuído", async () => {
    const order = { id: 401, tenantId: 4, assignedToUserId: 5, estimatedTotal: "500.00" };
    const balance = { id: 9, tenantId: 4, productId: 44, physicalQuantity: "8.000", reservedQuantity: "3.000" };
    const product = { id: 44, tenantId: 4, currentCost: "40.00" };
    const reservation = { id: 200, tenantId: 4, workOrderId: 401, productId: 44, quantity: "3.000", status: "active" };
    mocks.db = dbWith([[order], [balance], [product], [reservation], [{ cost: "80.00" }]]);
    const caller = workOrderRouter.createCaller(context());

    await expect(caller.consumeProduct({ tenantId: 4, workOrderId: 401, productId: 44, reservationId: 200, quantity: 2 })).resolves.toEqual({ success: true });

    expect(mocks.db.inserts()).toEqual(expect.arrayContaining([
      expect.objectContaining({ tenantId: 4, workOrderId: 401, productId: 44, reservationId: 200, quantity: "2.000", unitCost: "40.00", consumedByUserId: 5 }),
      expect.objectContaining({ tenantId: 4, productId: 44, type: "consumption", physicalDelta: "-2.000", reservedDelta: "-2.000", referenceId: 401 }),
    ]));
    expect(mocks.db.updates()).toEqual(expect.arrayContaining([expect.objectContaining({ realCostTotal: "80.00", realMarginPercent: "84.00" })]));
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 4, actorUserId: 5, action: "work_order.product_consumed", entityId: 401,
      before: { physicalQuantity: 8, reservedQuantity: 3, reservation: { quantity: 3, status: "active" } },
      after: { physicalQuantity: 6, reservedQuantity: 1, reservation: { quantity: 1, status: "active" } },
      metadata: { productId: 44, quantity: 2, reservationId: 200 },
    }));
  });

  it("bloqueia consumo em OS atribuída a outro técnico antes de tocar no estoque", async () => {
    mocks.db = dbWith([[{ id: 401, tenantId: 4, assignedToUserId: 99, estimatedTotal: "500.00" }]]);
    const caller = workOrderRouter.createCaller(context());
    await expect(caller.consumeProduct({ tenantId: 4, workOrderId: 401, productId: 44, quantity: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.db.inserts()).toHaveLength(0);
  });

  it("bloqueia consumo de OS que não pertence ao tenant antes de consultar ou alterar estoque", async () => {
    mocks.db = dbWith([[]]);
    const caller = workOrderRouter.createCaller(context());

    await expect(caller.consumeProduct({ tenantId: 4, workOrderId: 999, productId: 44, quantity: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.db.inserts()).toHaveLength(0);
    expect(mocks.db.updates()).toHaveLength(0);
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("interrompe o consumo se a reserva mudou antes da atualização atômica", async () => {
    const order = { id: 401, tenantId: 4, assignedToUserId: 5, estimatedTotal: "500.00" };
    const balance = { id: 9, tenantId: 4, productId: 44, physicalQuantity: "8.000", reservedQuantity: "3.000" };
    const product = { id: 44, tenantId: 4, currentCost: "40.00" };
    const reservation = { id: 200, tenantId: 4, workOrderId: 401, productId: 44, quantity: "3.000", status: "active" };
    mocks.db = dbWith([[order], [balance], [product], [reservation]], [[{ affectedRows: 0 }]]);
    const caller = workOrderRouter.createCaller(context());

    await expect(caller.consumeProduct({ tenantId: 4, workOrderId: 401, productId: 44, reservationId: 200, quantity: 2 })).rejects.toMatchObject({ code: "CONFLICT" });

    expect(mocks.db.inserts()).toEqual([]);
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("interrompe o consumo se o saldo físico mudou antes da atualização atômica", async () => {
    const order = { id: 401, tenantId: 4, assignedToUserId: 5, estimatedTotal: "500.00" };
    const balance = { id: 9, tenantId: 4, productId: 44, physicalQuantity: "8.000", reservedQuantity: "0.000" };
    const product = { id: 44, tenantId: 4, currentCost: "40.00" };
    mocks.db = dbWith([[order], [balance], [product]], [[{ affectedRows: 0 }]]);
    const caller = workOrderRouter.createCaller(context());

    await expect(caller.consumeProduct({ tenantId: 4, workOrderId: 401, productId: 44, quantity: 2 })).rejects.toMatchObject({ code: "CONFLICT" });

    expect(mocks.db.inserts()).toEqual([]);
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});
