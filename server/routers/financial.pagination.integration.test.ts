import type { TrpcContext } from "../_core/context";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: null as any,
  requirePermission: vi.fn(),
}));

vi.mock("../db", () => ({ getDb: vi.fn(async () => mocks.db), writeAuditLog: vi.fn() }));
vi.mock("../tenantAccess", () => ({ requireTenantPermission: mocks.requirePermission }));

import { financialRouter } from "./management";

function buildDb(rows: unknown[]) {
  const calls: Array<{ limit?: number; offset?: number }> = [];
  const query: any = {};
  query.from = vi.fn(() => query);
  query.where = vi.fn(() => query);
  query.orderBy = vi.fn(() => query);
  query.limit = vi.fn((limit: number) => { calls.push({ limit }); return query; });
  query.offset = vi.fn(async (offset: number) => { calls[calls.length - 1]!.offset = offset; return rows; });
  return { select: vi.fn(() => query), calls };
}

function createContext(): TrpcContext {
  return {
    user: { id: 7, openId: "financial-reader", role: "user", platformRole: "platform_user", name: "Gestor", email: "gestor@example.com", loginMethod: "manus", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const rows = [{ id: 3, tenantId: 4 }, { id: 2, tenantId: 4 }, { id: 1, tenantId: 4 }];

describe("financial listagens paginadas — integração tRPC simulada", () => {
  beforeEach(() => mocks.requirePermission.mockResolvedValue({ permissions: ["financial.view"] }));

  it("retorna receitas com limite adicional, página e indicador de continuação", async () => {
    mocks.db = buildDb(rows);
    const caller = financialRouter.createCaller(createContext());

    await expect(caller.revenues.list({ tenantId: 4, status: "expected", page: 2, pageSize: 2 })).resolves.toEqual({ items: rows.slice(0, 2), page: 2, pageSize: 2, hasMore: true });
    expect(mocks.db.calls).toEqual([{ limit: 3, offset: 2 }]);
  });

  it("retorna despesas paginadas sem expor página seguinte quando o limite não é excedido", async () => {
    mocks.db = buildDb(rows.slice(0, 2));
    const caller = financialRouter.createCaller(createContext());

    await expect(caller.expenses.list({ tenantId: 4, status: "paid", page: 1, pageSize: 2 })).resolves.toEqual({ items: rows.slice(0, 2), page: 1, pageSize: 2, hasMore: false });
    expect(mocks.db.calls).toEqual([{ limit: 3, offset: 0 }]);
  });

  it("aceita busca de descrição junto do status e paginação em receitas e despesas", async () => {
    const found = [{ id: 8, tenantId: 4, notes: "Instalação BMW", category: "Fornecedor" }];
    mocks.db = buildDb(found);
    const caller = financialRouter.createCaller(createContext());

    await expect(caller.revenues.list({ tenantId: 4, status: "expected", search: "Instalação", page: 1, pageSize: 10 })).resolves.toEqual({ items: found, page: 1, pageSize: 10, hasMore: false });
    expect(mocks.db.calls).toEqual([{ limit: 11, offset: 0 }]);

    mocks.db = buildDb(found);
    await expect(caller.expenses.list({ tenantId: 4, status: "planned", search: "Fornecedor", page: 1, pageSize: 10 })).resolves.toEqual({ items: found, page: 1, pageSize: 10, hasMore: false });
    expect(mocks.db.calls).toEqual([{ limit: 11, offset: 0 }]);
    expect(mocks.requirePermission).toHaveBeenCalledWith(expect.anything(), 4, "financial.view");
  });
});
