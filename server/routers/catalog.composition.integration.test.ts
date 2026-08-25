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

function buildDb(selectResults: unknown[], insertIds: number[] = []) {
  const inserts: unknown[] = [];
  const tx = {
    delete: vi.fn(() => ({ where: vi.fn(async () => [{ affectedRows: 1 }]) })),
    insert: vi.fn(() => ({ values: vi.fn(async () => [{ insertId: insertIds.shift() ?? 1 }]) })),
  };
  return {
    select: vi.fn(() => chain(selectResults.shift() ?? [])),
    insert: vi.fn(() => ({ values: vi.fn(async (value: unknown) => { inserts.push(value); return [{ insertId: insertIds.shift() ?? 1 }]; }) })),
    transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)),
    inserts: () => inserts,
  };
}

function createContext(): TrpcContext {
  return {
    user: { id: 7, openId: "catalog-owner", role: "user", platformRole: "platform_user", name: "Gestor", email: "gestor@example.com", loginMethod: "manus", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("catalog — composição segura por tenant", () => {
  beforeEach(() => {
    mocks.audit.mockReset();
    mocks.requirePermission.mockResolvedValue({ permissions: ["catalog.manage"] });
  });

  it("bloqueia a associação de produto externo a um serviço antes de alterar a composição", async () => {
    mocks.db = buildDb([[{ id: 81 }], []]);
    const caller = catalogRouter.createCaller(createContext());

    await expect(caller.services.setProducts({ tenantId: 4, serviceId: 81, items: [{ productId: 12, quantity: 1, required: true }] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.db.transaction).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("audita a atualização de componentes válidos de um serviço", async () => {
    mocks.db = buildDb([[{ id: 81 }], [{ id: 12 }]]);
    const caller = catalogRouter.createCaller(createContext());

    await expect(caller.services.setProducts({ tenantId: 4, serviceId: 81, items: [{ productId: 12, quantity: 2, required: true }] })).resolves.toEqual({ success: true });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 4, actorUserId: 7, action: "service.products_updated", entityType: "service", entityId: 81, after: { items: [{ productId: 12, quantity: 2, required: true }] } }));
  });

  it("bloqueia a criação de kit com componente de outra oficina", async () => {
    mocks.db = buildDb([[]]);
    const caller = catalogRouter.createCaller(createContext());

    await expect(caller.kits.create({ tenantId: 4, name: "Kit escape", items: [{ productId: 12, quantity: 1 }] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.db.transaction).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("bloqueia a criação de kit com serviço de outra oficina", async () => {
    mocks.db = buildDb([[]]);
    const caller = catalogRouter.createCaller(createContext());

    await expect(caller.kits.create({ tenantId: 4, name: "Kit escape", items: [{ serviceId: 33, quantity: 1 }] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.db.transaction).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("audita a criação de kit com componentes pertencentes ao tenant", async () => {
    mocks.db = buildDb([[{ id: 12 }]], [501, 1]);
    const caller = catalogRouter.createCaller(createContext());

    await expect(caller.kits.create({ tenantId: 4, name: "Kit escape", salePriceOverride: 350, items: [{ productId: 12, quantity: 1 }] })).resolves.toEqual({ id: 501 });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 4, actorUserId: 7, action: "kit.created", entityType: "kit", entityId: 501, after: { name: "Kit escape", categoryId: null, salePriceOverride: 350, items: [{ productId: 12, serviceId: null, quantity: 1 }] } }));
  });

  it("cria categoria de produto somente no tenant autorizado", async () => {
    mocks.db = buildDb([], [71]);
    const caller = catalogRouter.createCaller(createContext());

    await expect(caller.categories.createProduct({ tenantId: 4, name: "Performance", description: "Peças de preparação" })).resolves.toEqual({ id: 71 });
    expect(mocks.requirePermission).toHaveBeenCalledWith(expect.anything(), 4, "catalog.manage");
    expect(mocks.db.inserts()).toEqual([expect.objectContaining({ tenantId: 4, name: "Performance", description: "Peças de preparação" })]);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 4, actorUserId: 7, action: "product_category.created", entityType: "product_category", entityId: 71, after: { name: "Performance", description: "Peças de preparação" } }));
  });

  it("bloqueia categoria de produto pertencente a outra oficina antes de criar o produto", async () => {
    mocks.db = buildDb([[], []]);
    const caller = catalogRouter.createCaller(createContext());

    await expect(caller.products.create({ tenantId: 4, name: "Filtro esportivo", salePrice: 100, categoryId: 91 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.db.transaction).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("bloqueia categoria de serviço pertencente a outra oficina antes de criar o serviço", async () => {
    mocks.db = buildDb([[], []]);
    const caller = catalogRouter.createCaller(createContext());

    await expect(caller.services.create({ tenantId: 4, name: "Instalação", laborPrice: 100, categoryId: 92 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.db.inserts()).toEqual([]);
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});
