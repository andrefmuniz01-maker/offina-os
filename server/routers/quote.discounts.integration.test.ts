import { describe, expect, it, beforeEach, vi } from "vitest";
import type { TrpcContext } from "../_core/context";

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
  requireTenantPermission: mocks.requirePermission,
  hasPermission: mocks.hasPermission,
  getTenantAccess: vi.fn(),
}));

import { quoteRouter } from "./quotes";

function chain(result: unknown) {
  const query: any = {};
  query.from = vi.fn(() => query);
  query.where = vi.fn(() => query);
  query.limit = vi.fn(async () => result);
  query.orderBy = vi.fn(async () => result);
  return query;
}

function buildDb(selectResults: unknown[]) {
  const update = vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => [{ affectedRows: 1 }]) })) }));
  const tx = { update };
  return {
    select: vi.fn(() => chain(selectResults.shift() ?? [])),
    transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)),
    update,
  };
}

function createContext(): TrpcContext {
  return {
    user: { id: 7, openId: "test-owner", role: "user", platformRole: "platform_user", name: "Owner", email: "owner@example.com", loginMethod: "manus", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const quote = { id: 81, tenantId: 4, status: "ready", total: "250.00", discountTotal: "0.00", estimatedMarginPercent: "44.00" };
const items = [
  { id: 301, tenantId: 4, quoteId: 81, description: "Peça", quantity: "2.000", unitPrice: "100.00", unitCost: "60.00", discount: "0.00" },
  { id: 302, tenantId: 4, quoteId: 81, description: "Instalação", quantity: "1.000", unitPrice: "50.00", unitCost: "20.00", discount: "0.00" },
];
const settings = { tenantId: 4, attendantMaxDiscountPercent: "10.00", minimumMarginPercent: "10.00" };

describe("quotes.applyDiscounts — integração tRPC simulada", () => {
  beforeEach(() => {
    mocks.audit.mockReset();
    mocks.requirePermission.mockResolvedValue({ permissions: ["quotes.manage"], isPlatformSuperAdmin: false });
    mocks.hasPermission.mockImplementation((access: { permissions: string[] }, permission: string) => access.permissions.includes(permission));
  });

  it("recalcula e persiste descontos autorizados de um atendente", async () => {
    mocks.db = buildDb([[quote], items, [settings]]);
    const caller = quoteRouter.createCaller(createContext());

    const result = await caller.applyDiscounts({ tenantId: 4, quoteId: 81, items: [{ quoteItemId: 301, discount: 10 }, { quoteItemId: 302, discount: 0 }] });

    expect(result).toEqual({ subtotal: 250, discountTotal: 10, total: 240, totalCost: 140, marginPercent: 41.67 });
    expect(mocks.db.transaction).toHaveBeenCalledOnce();
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 4, actorUserId: 7, action: "quote.discounts_updated", entityId: 81 }));
  });

  it("bloqueia desconto acima da autonomia do atendente antes de iniciar a transação", async () => {
    mocks.db = buildDb([[quote], items, [settings]]);
    const caller = quoteRouter.createCaller(createContext());

    await expect(caller.applyDiscounts({ tenantId: 4, quoteId: 81, items: [{ quoteItemId: 301, discount: 30 }, { quoteItemId: 302, discount: 0 }] })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.db.transaction).not.toHaveBeenCalled();
  });

  it("não permite alterar um orçamento ausente no tenant solicitado", async () => {
    mocks.db = buildDb([[]]);
    const caller = quoteRouter.createCaller(createContext());

    await expect(caller.applyDiscounts({ tenantId: 4, quoteId: 999, items: [{ quoteItemId: 301, discount: 0 }] })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.db.transaction).not.toHaveBeenCalled();
  });
});
