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

import { catalogRouter } from "./catalog";

function chain(result: unknown) {
  const query: any = {};
  query.from = vi.fn(() => query);
  query.where = vi.fn(() => query);
  query.limit = vi.fn(async () => result);
  query.orderBy = vi.fn(async () => result);
  query.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
  return query;
}

function buildDb(selectResults: unknown[], insertIds: number[]) {
  const tx = {
    insert: vi.fn(() => ({ values: vi.fn(async () => [{ insertId: insertIds.shift() ?? 1 }]) })),
  };
  return {
    select: vi.fn(() => chain(selectResults.shift() ?? [])),
    insert: vi.fn(() => ({ values: vi.fn(async () => [{ insertId: insertIds.shift() ?? 1 }]) })),
    transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)),
  };
}

function createContext(): TrpcContext {
  return {
    user: { id: 7, openId: "catalog-manager", role: "user", platformRole: "platform_user", name: "Gestor", email: "gestor@example.com", loginMethod: "manus", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("catalog — auditoria de criação comercial", () => {
  beforeEach(() => {
    mocks.audit.mockReset();
    mocks.requirePermission.mockResolvedValue({ permissions: ["catalog.manage", "financial.manage"] });
    mocks.hasPermission.mockReturnValue(true);
  });

  it("registra custo, preço e margem ao criar um produto", async () => {
    mocks.db = buildDb([[]], [101, 1]);
    const caller = catalogRouter.createCaller(createContext());

    await expect(caller.products.create({ tenantId: 4, name: "Downpipe inox", currentCost: 100, salePrice: 150, desiredMarginPercent: 20, minStock: 1 })).resolves.toEqual({ id: 101 });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 4, actorUserId: 7, action: "product.created", entityType: "product", entityId: 101,
      after: expect.objectContaining({ name: "Downpipe inox", currentCost: 100, salePrice: 150, desiredMarginPercent: 20 }),
    }));
  });

  it("registra custo, preço e margem ao criar um serviço", async () => {
    mocks.db = buildDb([[]], [202]);
    const caller = catalogRouter.createCaller(createContext());

    await expect(caller.services.create({ tenantId: 4, name: "Instalação de escape", estimatedMinutes: 120, estimatedCost: 100, laborPrice: 250, desiredMarginPercent: 30 })).resolves.toEqual({ id: 202 });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 4, actorUserId: 7, action: "service.created", entityType: "service", entityId: 202,
      after: expect.objectContaining({ name: "Instalação de escape", estimatedMinutes: 120, estimatedCost: 100, laborPrice: 250, desiredMarginPercent: 30 }),
    }));
  });
});
