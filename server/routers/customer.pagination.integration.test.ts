import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";

const mocks = vi.hoisted(() => ({ db: null as any, requirePermission: vi.fn() }));
vi.mock("../db", () => ({ getDb: vi.fn(async () => mocks.db), writeAuditLog: vi.fn() }));
vi.mock("../tenantAccess", () => ({ getTenantAccess: vi.fn(), hasPermission: vi.fn(), requireTenantPermission: mocks.requirePermission }));

import { customerRouter } from "./catalog";

function query(result: unknown) {
  const builder: any = {};
  builder.from = vi.fn(() => builder);
  builder.where = vi.fn(() => builder);
  builder.orderBy = vi.fn(() => builder);
  builder.limit = vi.fn(() => builder);
  builder.offset = vi.fn(() => builder);
  builder.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
  return builder;
}

function context(): TrpcContext {
  return { user: { id: 7, openId: "attendant", role: "user", platformRole: "platform_user", name: "Atendente", email: "atendente@example.com", loginMethod: "manus", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

describe("customers.listPaged — busca e paginação operacional", () => {
  beforeEach(() => mocks.requirePermission.mockResolvedValue({ permissions: ["customers.manage"] }));

  it("retorna apenas a página solicitada e sinaliza mais resultados no tenant consultado", async () => {
    const first = { id: 21, tenantId: 4, name: "Marina", whatsapp: "11999999999" };
    const next = { id: 22, tenantId: 4, name: "Marina Silva", whatsapp: "11888888888" };
    mocks.db = { select: vi.fn(() => query([first, next])) };
    const caller = customerRouter.createCaller(context());

    await expect(caller.listPaged({ tenantId: 4, search: "Marina", page: 1, pageSize: 1 })).resolves.toEqual({ items: [first], page: 1, pageSize: 1, hasMore: true });
    expect(mocks.requirePermission).toHaveBeenCalledWith(expect.anything(), 4, "customers.manage");
  });
});
