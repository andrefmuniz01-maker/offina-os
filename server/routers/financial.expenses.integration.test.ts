import type { TrpcContext } from "../_core/context";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: null as any,
  audit: vi.fn(),
  requirePermission: vi.fn(),
}));

vi.mock("../db", () => ({ getDb: vi.fn(async () => mocks.db), writeAuditLog: mocks.audit }));
vi.mock("../tenantAccess", () => ({ requireTenantPermission: mocks.requirePermission }));

import { financialRouter } from "./management";

function buildDb(affectedRows: number) {
  return {
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => [{ affectedRows }]) })) })),
  };
}

function createContext(): TrpcContext {
  return {
    user: { id: 7, openId: "financial-manager", role: "user", platformRole: "platform_user", name: "Gestor", email: "gestor@example.com", loginMethod: "manus", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("financial.expenses.markPaid — integração tRPC simulada", () => {
  beforeEach(() => {
    mocks.audit.mockReset();
    mocks.requirePermission.mockResolvedValue({ permissions: ["financial.manage"] });
  });

  it("confirma a baixa planejada no tenant e cria a auditoria correspondente", async () => {
    mocks.db = buildDb(1);
    const caller = financialRouter.createCaller(createContext());

    await expect(caller.expenses.markPaid({ tenantId: 4, expenseId: 55 })).resolves.toEqual({ success: true });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 4, actorUserId: 7, action: "expense.paid", entityType: "expense", entityId: 55, after: { status: "paid" } }));
  });

  it("bloqueia baixa de despesa inexistente, de outro tenant ou já finalizada sem auditar", async () => {
    mocks.db = buildDb(0);
    const caller = financialRouter.createCaller(createContext());

    await expect(caller.expenses.markPaid({ tenantId: 4, expenseId: 999 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});
