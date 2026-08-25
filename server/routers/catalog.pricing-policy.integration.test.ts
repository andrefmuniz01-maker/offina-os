import type { TrpcContext } from "../_core/context";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ db: null as any, audit: vi.fn(), requirePermission: vi.fn(), hasPermission: vi.fn() }));
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

describe("catalog.services.create — política de preço por tenant", () => {
  beforeEach(() => { mocks.audit.mockReset(); mocks.requirePermission.mockResolvedValue({ permissions: ["catalog.manage", "financial.manage"] }); mocks.hasPermission.mockReturnValue(true); });

  it("aplica a margem padrão do tenant ao custo e usa a hora padrão como piso para mão de obra", async () => {
    const inserted: unknown[] = [];
    mocks.db = { select: vi.fn(() => chain([{ defaultPartsMarginPercent: "25.00", defaultLaborHourlyRate: "200.00", minimumMarginPercent: "0.00" }])), insert: vi.fn(() => ({ values: vi.fn(async (value: unknown) => { inserted.push(value); return [{ insertId: 81 }]; }) })) };
    const caller = catalogRouter.createCaller(context());

    await expect(caller.services.create({ tenantId: 4, name: "Instalação premium", estimatedMinutes: 30, estimatedCost: 100, laborPrice: 0, desiredMarginPercent: 0 })).resolves.toEqual({ id: 81 });
    expect(inserted).toEqual([expect.objectContaining({ tenantId: 4, laborPrice: "133.33", estimatedCost: "100.00", desiredMarginPercent: "25.00" })]);

    mocks.db = { select: vi.fn(() => chain([{ defaultPartsMarginPercent: "0.00", defaultPartsMarkupPercent: "40.00", defaultLaborHourlyRate: "200.00", minimumMarginPercent: "0.00" }])), insert: vi.fn(() => ({ values: vi.fn(async (value: unknown) => { inserted.push(value); return [{ insertId: 82 }]; }) })) };
    await expect(caller.services.create({ tenantId: 4, name: "Diagnóstico", estimatedMinutes: 30, estimatedCost: 100, laborPrice: 0, desiredMarginPercent: 0 })).resolves.toEqual({ id: 82 });
    expect(inserted[1]).toEqual(expect.objectContaining({ laborPrice: "140.00", estimatedCost: "100.00", desiredMarginPercent: "0.00" }));
  });
});
