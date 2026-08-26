import type { TrpcContext } from "../_core/context";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ db: null as any, requirePermission: vi.fn(), hasPermission: vi.fn() }));
vi.mock("../db", () => ({ getDb: vi.fn(async () => mocks.db), writeAuditLog: vi.fn() }));
vi.mock("../tenantAccess", () => ({ requireTenantPermission: mocks.requirePermission, getTenantAccess: vi.fn(), hasPermission: mocks.hasPermission }));

import { inventoryRouter } from "./inventory";

function buildDb(rows: unknown[]) {
  const calls: Array<{ limit?: number; offset?: number }> = [];
  const query: any = {};
  query.from = vi.fn(() => query);
  query.innerJoin = vi.fn(() => query);
  query.where = vi.fn(() => query);
  query.orderBy = vi.fn(() => query);
  query.limit = vi.fn((limit: number) => { calls.push({ limit }); return query; });
  query.offset = vi.fn(async (offset: number) => { calls[calls.length - 1]!.offset = offset; return rows; });
  return { select: vi.fn(() => query), calls };
}

function context(): TrpcContext {
  return { user: { id: 7, openId: "inventory-manager", role: "user", platformRole: "platform_user", name: "Gestor", email: "gestor@example.com", loginMethod: "manus", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

describe("inventory.list — paginação e isolamento", () => {
  beforeEach(() => { mocks.requirePermission.mockResolvedValue({ permissions: ["inventory.manage"] }); mocks.hasPermission.mockReturnValue(false); });

  it("combina busca, tenant, página e limite adicional sem expor custo a perfil restrito", async () => {
    const rows = [
      { product: { id: 8, tenantId: 4, name: "Filtro performance", sku: "FLT-1", unit: "un", minStock: "2.000", currentCost: "50.00", averageCost: "50.00", salePrice: "100.00" }, balance: { physicalQuantity: "5.000", reservedQuantity: "1.000" } },
      { product: { id: 9, tenantId: 4, name: "Filtro premium", sku: "FLT-2", unit: "un", minStock: "1.000", currentCost: "70.00", averageCost: "70.00", salePrice: "140.00" }, balance: { physicalQuantity: "2.000", reservedQuantity: "0.000" } },
      { product: { id: 10, tenantId: 4, name: "Filtro esportivo", sku: "FLT-3", unit: "un", minStock: "1.000", currentCost: "80.00", averageCost: "80.00", salePrice: "160.00" }, balance: { physicalQuantity: "1.000", reservedQuantity: "0.000" } },
    ];
    mocks.db = buildDb(rows);

    await expect(inventoryRouter.createCaller(context()).list({ tenantId: 4, search: "Filtro", page: 2, pageSize: 2 })).resolves.toEqual({
      items: [
        expect.objectContaining({ id: 8, availableQuantity: 4 }),
        expect.objectContaining({ id: 9, availableQuantity: 2 }),
      ], page: 2, pageSize: 2, hasMore: true,
    });
    expect(mocks.db.calls).toEqual([{ limit: 3, offset: 2 }]);
    expect(mocks.requirePermission).toHaveBeenCalledWith(expect.anything(), 4, "inventory.manage");
    expect((await inventoryRouter.createCaller(context()).list({ tenantId: 4, page: 1, pageSize: 2 })).items[0]).not.toHaveProperty("currentCost");
  });
});
