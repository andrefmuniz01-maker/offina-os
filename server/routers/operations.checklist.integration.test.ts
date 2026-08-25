import type { TrpcContext } from "../_core/context";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: null as any,
  audit: vi.fn(),
  access: vi.fn(),
  hasPermission: vi.fn(),
}));

vi.mock("../db", () => ({
  getDb: vi.fn(async () => mocks.db),
  writeAuditLog: mocks.audit,
}));

vi.mock("../tenantAccess", () => ({
  getTenantAccess: mocks.access,
  hasPermission: mocks.hasPermission,
  requireTenantPermission: vi.fn(),
}));

import { workOrderRouter } from "./operations";

function chain(result: unknown) {
  const query: any = {};
  query.from = vi.fn(() => query);
  query.innerJoin = vi.fn(() => query);
  query.where = vi.fn(() => query);
  query.limit = vi.fn(async () => result);
  query.orderBy = vi.fn(async () => result);
  query.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
  return query;
}

function buildDb(selectResults: unknown[]) {
  const update = vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => [{ affectedRows: 1 }]) })) }));
  return { select: vi.fn(() => chain(selectResults.shift() ?? [])), update };
}

function createContext(): TrpcContext {
  return {
    user: { id: 7, openId: "workshop-manager", role: "user", platformRole: "platform_user", name: "Gestor", email: "gestor@example.com", loginMethod: "manus", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("workOrders.toggleChecklist — integração tRPC simulada", () => {
  beforeEach(() => {
    mocks.audit.mockReset();
    mocks.access.mockResolvedValue({ membership: { role: "admin" }, permissions: ["work_orders.manage"] });
    mocks.hasPermission.mockReturnValue(true);
  });

  it("registra a mudança de checklist com estado anterior e vínculo da OS", async () => {
    mocks.db = buildDb([[{ checklist: { id: 55, tenantId: 4, workOrderId: 81, completed: false }, order: { id: 81, tenantId: 4, assignedToUserId: null } }]]);
    const caller = workOrderRouter.createCaller(createContext());

    await expect(caller.toggleChecklist({ tenantId: 4, checklistId: 55, completed: true })).resolves.toEqual({ success: true });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 4, actorUserId: 7, action: "work_order.checklist_updated", entityType: "work_order_checklist", entityId: 55, before: { completed: false }, after: { completed: true, workOrderId: 81 } }));
  });

  it("bloqueia checklist que não pertence ao tenant informado", async () => {
    mocks.db = buildDb([[]]);
    const caller = workOrderRouter.createCaller(createContext());

    await expect(caller.toggleChecklist({ tenantId: 4, checklistId: 999, completed: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.db.update).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});
