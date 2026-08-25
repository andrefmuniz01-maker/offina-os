import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";

const mocks = vi.hoisted(() => ({ db: null as any, requirePermission: vi.fn(), hasPermission: vi.fn() }));
vi.mock("../db", () => ({ getDb: vi.fn(async () => mocks.db), writeAuditLog: vi.fn() }));
vi.mock("../tenantAccess", () => ({ getTenantAccess: vi.fn(), hasPermission: mocks.hasPermission, requireTenantPermission: mocks.requirePermission }));

import { quoteRouter } from "./quotes";

function query(result: unknown) {
  const builder: any = {};
  builder.from = vi.fn(() => builder);
  builder.innerJoin = vi.fn(() => builder);
  builder.where = vi.fn(() => builder);
  builder.orderBy = vi.fn(() => builder);
  builder.limit = vi.fn(() => builder);
  builder.offset = vi.fn(() => builder);
  builder.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
  return builder;
}

function context(): TrpcContext {
  return { user: { id: 7, openId: "quote-manager", role: "user", platformRole: "platform_user", name: "Gestor", email: "gestor@example.com", loginMethod: "manus", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

describe("quotes.list — paginação e dados financeiros", () => {
  beforeEach(() => {
    mocks.requirePermission.mockResolvedValue({ permissions: ["quotes.manage"] });
    mocks.hasPermission.mockReset();
  });

  it("pagina a listagem filtrada do tenant e não retorna margem ou custo a perfil restrito", async () => {
    mocks.hasPermission.mockReturnValue(false);
    const restrictedQuote = { id: 81, tenantId: 4, number: 12, status: "sent", total: "1200.00", estimatedCostTotal: "800.00", estimatedMarginPercent: "33.33" };
    const nextQuote = { id: 82, tenantId: 4, number: 13, status: "sent", total: "900.00", estimatedCostTotal: "600.00", estimatedMarginPercent: "33.33" };
    mocks.db = { select: vi.fn(() => query([{ quote: restrictedQuote, customer: { id: 21, name: "Marina" }, vehicle: { id: 31, make: "BMW", model: "320i" } }, { quote: nextQuote, customer: { id: 22, name: "João" }, vehicle: { id: 32, make: "Audi", model: "A3" } }])) };
    const caller = quoteRouter.createCaller(context());

    await expect(caller.list({ tenantId: 4, status: "sent", page: 1, pageSize: 1 })).resolves.toEqual({
      items: [{ quote: { id: 81, tenantId: 4, number: 12, status: "sent", total: "1200.00" }, customer: { id: 21, name: "Marina" }, vehicle: { id: 31, make: "BMW", model: "320i" } }],
      page: 1, pageSize: 1, hasMore: true,
    });
  });

  it("mantém campos de custo e margem apenas para perfil com financial.view", async () => {
    mocks.hasPermission.mockReturnValue(true);
    const financialQuote = { id: 81, tenantId: 4, number: 12, status: "approved", total: "1200.00", estimatedCostTotal: "800.00", estimatedMarginPercent: "33.33" };
    mocks.db = { select: vi.fn(() => query([{ quote: financialQuote, customer: { id: 21, name: "Marina" }, vehicle: { id: 31, make: "BMW", model: "320i" } }])) };
    const caller = quoteRouter.createCaller(context());

    await expect(caller.list({ tenantId: 4, page: 1, pageSize: 10 })).resolves.toEqual({ items: [{ quote: financialQuote, customer: { id: 21, name: "Marina" }, vehicle: { id: 31, make: "BMW", model: "320i" } }], page: 1, pageSize: 10, hasMore: false });
  });
});
