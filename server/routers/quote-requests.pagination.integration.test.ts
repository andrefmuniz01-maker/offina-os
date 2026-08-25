import type { TrpcContext } from "../_core/context";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ db: null as any, requirePermission: vi.fn() }));
vi.mock("../db", () => ({ getDb: vi.fn(async () => mocks.db), writeAuditLog: vi.fn() }));
vi.mock("../tenantAccess", () => ({ requireTenantPermission: mocks.requirePermission, getTenantAccess: vi.fn(), hasPermission: vi.fn() }));

import { quoteRequestRouter } from "./quotes";

function buildDb(results: unknown[]) {
  const calls: Array<{ limit?: number; offset?: number }> = [];
  const select = vi.fn(() => {
    const result = results.shift() ?? [];
    const query: any = {};
    query.from = vi.fn(() => query);
    query.leftJoin = vi.fn(() => query);
    query.innerJoin = vi.fn(() => query);
    query.where = vi.fn(() => query);
    query.orderBy = vi.fn(() => query);
    query.limit = vi.fn((limit: number) => { calls.push({ limit }); return query; });
    query.offset = vi.fn(async (offset: number) => { calls[calls.length - 1]!.offset = offset; return result; });
    query.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
    return query;
  });
  return { select, calls };
}

function createContext(): TrpcContext {
  return { user: { id: 7, openId: "commercial-owner", role: "user", platformRole: "platform_user", name: "Gestor", email: "gestor@example.com", loginMethod: "manus", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

describe("quoteRequests.list — paginação integrada", () => {
  beforeEach(() => mocks.requirePermission.mockResolvedValue({ permissions: ["quotes.manage"] }));

  it("retorna somente a página solicitada, preservando tempo em fila e indicador de continuação", async () => {
    const createdAt = new Date("2026-08-25T10:00:00.000Z");
    const rows = [1, 2, 3].map(id => ({ request: { id, tenantId: 4, number: id, createdAt }, customer: null, vehicle: null, assignedUser: null }));
    mocks.db = buildDb([rows, []]);
    const caller = quoteRequestRouter.createCaller(createContext());

    const output = await caller.list({ tenantId: 4, status: "in_analysis", page: 2, pageSize: 2 });

    expect(output).toEqual(expect.objectContaining({ page: 2, pageSize: 2, hasMore: true, items: [expect.objectContaining({ request: expect.objectContaining({ id: 1 }), queueMinutes: expect.any(Number) }), expect.objectContaining({ request: expect.objectContaining({ id: 2 }), queueMinutes: expect.any(Number) })] }));
    expect(mocks.db.calls).toEqual([{ limit: 3, offset: 2 }]);
  });
});
