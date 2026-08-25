import type { TrpcContext } from "../_core/context";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ db: null as any, requirePermission: vi.fn() }));
vi.mock("../db", () => ({ getDb: vi.fn(async () => mocks.db), writeAuditLog: vi.fn() }));
vi.mock("../tenantAccess", () => ({ requireTenantPermission: mocks.requirePermission, getTenantAccess: vi.fn(), hasPermission: vi.fn() }));

import { inventoryRouter } from "./inventory";

function chain(result: unknown) {
  const query: any = {};
  query.from = vi.fn(() => query);
  query.innerJoin = vi.fn(() => query);
  query.leftJoin = vi.fn(() => query);
  query.where = vi.fn(() => query);
  query.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
  return query;
}

function context(): TrpcContext {
  return { user: { id: 7, openId: "inventory-manager", role: "user", platformRole: "platform_user", name: "Gestor", email: "gestor@example.com", loginMethod: "manus", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

describe("inventory.forecast — integração tRPC", () => {
  beforeEach(() => mocks.requirePermission.mockResolvedValue({ permissions: ["inventory.manage"] }));

  it("agrega reservas e agenda do mesmo tenant para sugerir a quantidade de compra", async () => {
    const select = vi.fn();
    select.mockReturnValueOnce(chain([{ product: { id: 8, name: "Junta", minStock: "4.000" }, balance: { physicalQuantity: "5.000", reservedQuantity: "2.000" } }]))
      .mockReturnValueOnce(chain([{ productId: 8, quantity: "2.000" }]))
      .mockReturnValueOnce(chain([{ appointment: { id: 100 }, item: { productId: 8, quantity: "4.000" } }]))
      .mockReturnValueOnce(chain([]));
    mocks.db = { select };

    const output = await inventoryRouter.createCaller(context()).forecast({ tenantId: 4, until: new Date("2026-09-01T00:00:00.000Z") });

    expect(output).toEqual([{ productId: 8, productName: "Junta", physical: 5, reserved: 2, available: 3, futureNeed: 4, unreservedFutureNeed: 4, activeReservationDemand: 2, projectedDeficit: 1, recommendedPurchaseQuantity: 1, affectedAppointmentIds: [100], affectedWorkOrderIds: [], critical: true }]);
  });

  it("inclui itens de OS ativa sem agendamento e não duplica demanda já coberta por reserva da própria OS", async () => {
    const select = vi.fn();
    select.mockReturnValueOnce(chain([{ product: { id: 8, name: "Junta", minStock: "0.000" }, balance: { physicalQuantity: "2.000", reservedQuantity: "2.000" } }]))
      .mockReturnValueOnce(chain([{ productId: 8, workOrderId: 77, quoteId: null, quantity: "2.000" }]))
      .mockReturnValueOnce(chain([]))
      .mockReturnValueOnce(chain([{ workOrder: { id: 77 }, item: { productId: 8, quantity: "2.000" } }]));
    mocks.db = { select };

    const output = await inventoryRouter.createCaller(context()).forecast({ tenantId: 4 });

    expect(output).toEqual([{ productId: 8, productName: "Junta", physical: 2, reserved: 2, available: 0, futureNeed: 2, unreservedFutureNeed: 0, activeReservationDemand: 2, projectedDeficit: 0, recommendedPurchaseQuantity: 0, affectedAppointmentIds: [], affectedWorkOrderIds: [77], critical: true }]);
  });
});
