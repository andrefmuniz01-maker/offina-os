import type { TrpcContext } from "../_core/context";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ db: null as any, requirePermission: vi.fn(), hasPermission: vi.fn(), audit: vi.fn() }));
vi.mock("../db", () => ({ getDb: vi.fn(async () => mocks.db), writeAuditLog: mocks.audit }));
vi.mock("../tenantAccess", () => ({ requireTenantPermission: mocks.requirePermission, hasPermission: mocks.hasPermission, getTenantAccess: vi.fn() }));

import { catalogRouter } from "./catalog";

function chain(result: unknown) {
  const query: any = {};
  query.from = vi.fn(() => query);
  query.where = vi.fn(() => query);
  query.limit = vi.fn(async () => result);
  query.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
  return query;
}

function context(): TrpcContext {
  return { user: { id: 7, openId: "financial-manager", role: "user", platformRole: "platform_user", name: "Gestor", email: "gestor@example.com", loginMethod: "manus", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

describe("catalogo financeiro — isolamento por tenant", () => {
  beforeEach(() => { mocks.requirePermission.mockResolvedValue({ permissions: ["catalog.manage", "financial.manage"] }); mocks.hasPermission.mockReturnValue(true); mocks.audit.mockReset(); });

  it("bloqueia atualização financeira de produto ou serviço externo antes de executar update ou auditoria", async () => {
    const update = vi.fn();
    mocks.db = { select: vi.fn(() => chain([])), update };
    const caller = catalogRouter.createCaller(context());

    await expect(caller.products.updateFinancial({ tenantId: 4, productId: 900, currentCost: 100, salePrice: 150, desiredMarginPercent: 20 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(caller.services.updateFinancial({ tenantId: 4, serviceId: 901, estimatedCost: 100, laborPrice: 180, desiredMarginPercent: 20 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(update).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});
