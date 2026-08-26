import type { TrpcContext } from "../_core/context";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ db: null as any, audit: vi.fn(), getAccess: vi.fn(), hasPermission: vi.fn() }));
vi.mock("../db", () => ({ getDb: vi.fn(async () => mocks.db), writeAuditLog: mocks.audit }));
vi.mock("../tenantAccess", () => ({ getTenantAccess: mocks.getAccess, hasPermission: mocks.hasPermission, requireTenantPermission: vi.fn() }));

import { workOrderRouter } from "./operations";

function chain(result: unknown) {
  const query: any = {};
  query.from = vi.fn(() => query);
  query.where = vi.fn(() => query);
  query.limit = vi.fn(async () => result);
  query.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
  return query;
}

function updateChain() { const query: any = {}; query.set = vi.fn(() => query); query.where = vi.fn(async () => [{ affectedRows: 1 }]); return query; }
function buildDb(results: unknown[], updateResults: unknown[] = []) {
  const inserted: unknown[] = [];
  const tx = { select: vi.fn(() => chain(results.shift() ?? [])), update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => updateResults.shift() ?? [{ affectedRows: 1 }]) })) })), insert: vi.fn(() => ({ values: vi.fn(async (value: unknown) => { inserted.push(value); return [{ insertId: inserted.length }]; }) })) };
  return { db: { select: vi.fn(() => chain(results.shift() ?? [])), transaction: vi.fn(async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx)) }, inserted, tx };
}

function context(): TrpcContext {
  return { user: { id: 7, openId: "operations-manager", role: "user", platformRole: "platform_user", name: "Gestor", email: "gestor@example.com", loginMethod: "manus", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

describe("operations.updateStatus — finalização integrada", () => {
  beforeEach(() => { mocks.audit.mockReset(); mocks.getAccess.mockResolvedValue({ membership: { role: "admin" } }); mocks.hasPermission.mockReturnValue(true); });

  it("cria receita prevista ao concluir e cria pós-venda ao entregar, liberando reservas apenas no tenant da OS", async () => {
    const completed = buildDb([[{ id: 91, tenantId: 4, number: 12, status: "in_service", customerId: 21, vehicleId: 22, appointmentId: 31, estimatedTotal: "850.00", notes: null }], [], []]);
    mocks.db = completed.db;
    const caller = workOrderRouter.createCaller(context());

    await expect(caller.updateStatus({ tenantId: 4, workOrderId: 91, status: "completed" })).resolves.toEqual({ success: true });
    expect(completed.inserted).toContainEqual(expect.objectContaining({ tenantId: 4, workOrderId: 91, customerId: 21, vehicleId: 22, amount: "850.00", status: "expected" }));
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 4, action: "work_order.status_updated", before: expect.objectContaining({ status: "in_service" }), after: expect.objectContaining({ status: "completed", completedAt: "set" }) }));

    const delivered = buildDb([[{ id: 91, tenantId: 4, number: 12, status: "completed", customerId: 21, vehicleId: 22, appointmentId: 31, estimatedTotal: "850.00", notes: null }], [{ id: 63, tenantId: 4, productId: 8, quantity: "2.000", status: "active" }], [{ id: 44, tenantId: 4, productId: 8, reservedQuantity: "2.000" }]]);
    mocks.db = delivered.db;
    await expect(caller.updateStatus({ tenantId: 4, workOrderId: 91, status: "delivered" })).resolves.toEqual({ success: true });
    expect(delivered.inserted).toEqual(expect.arrayContaining([
      expect.objectContaining({ tenantId: 4, workOrderId: 91, type: "post_sale_suggested", customerId: 21, vehicleId: 22 }),
      expect.objectContaining({ tenantId: 4, productId: 8, type: "reservation_release", referenceType: "work_order", referenceId: 91 }),
    ]));
    expect(delivered.tx.update).toHaveBeenCalledTimes(4);
  });

  it("não duplica a receita prevista quando a OS já possui lançamento financeiro", async () => {
    const existingRevenue = buildDb([[{ id: 91, tenantId: 4, number: 12, status: "completed", customerId: 21, vehicleId: 22, appointmentId: 31, estimatedTotal: "850.00", notes: null }], [], [{ id: 700 }]]);
    mocks.db = existingRevenue.db;
    const caller = workOrderRouter.createCaller(context());

    await expect(caller.updateStatus({ tenantId: 4, workOrderId: 91, status: "completed" })).resolves.toEqual({ success: true });

    expect(existingRevenue.inserted).toEqual([]);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 4, action: "work_order.status_updated", entityId: 91 }));
  });

  it("não repete a notificação de pós-venda quando a entrega já foi registrada", async () => {
    const deliveredAgain = buildDb([[{ id: 91, tenantId: 4, number: 12, status: "delivered", customerId: 21, vehicleId: 22, appointmentId: 31, estimatedTotal: "850.00", notes: null }]]);
    mocks.db = deliveredAgain.db;
    const caller = workOrderRouter.createCaller(context());

    await expect(caller.updateStatus({ tenantId: 4, workOrderId: 91, status: "delivered" })).resolves.toEqual({ success: true });

    expect(deliveredAgain.inserted).toEqual([]);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ after: expect.objectContaining({ status: "delivered" }) }));
  });

  it("não libera saldo nem registra movimento quando outra sessão já liberou a reserva", async () => {
    const concurrentRelease = buildDb([
      [{ id: 91, tenantId: 4, number: 12, status: "completed", customerId: 21, vehicleId: 22, appointmentId: 31, estimatedTotal: "850.00", notes: null }],
      [{ id: 63, tenantId: 4, productId: 8, quantity: "2.000", status: "active" }],
    ], [[{ affectedRows: 1 }], [{ affectedRows: 1 }], [{ affectedRows: 0 }]]);
    mocks.db = concurrentRelease.db;
    const caller = workOrderRouter.createCaller(context());

    await expect(caller.updateStatus({ tenantId: 4, workOrderId: 91, status: "delivered" })).resolves.toEqual({ success: true });

    expect(concurrentRelease.inserted).toContainEqual(expect.objectContaining({ type: "post_sale_suggested", workOrderId: 91 }));
    expect(concurrentRelease.inserted).not.toContainEqual(expect.objectContaining({ type: "reservation_release", referenceId: 91 }));
  });
});
