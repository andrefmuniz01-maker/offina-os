import type { TrpcContext } from "../_core/context";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ db: null as any, requirePermission: vi.fn(), getAccess: vi.fn(), hasPermission: vi.fn() }));
vi.mock("../db", () => ({ getDb: vi.fn(async () => mocks.db), writeAuditLog: vi.fn() }));
vi.mock("../tenantAccess", () => ({ requireTenantPermission: mocks.requirePermission, getTenantAccess: mocks.getAccess, hasPermission: mocks.hasPermission }));

import { appointmentRouter, workOrderRouter } from "./operations";

function query(result: unknown) {
  const builder: any = {};
  builder.from = vi.fn(() => builder);
  builder.innerJoin = vi.fn(() => builder);
  builder.leftJoin = vi.fn(() => builder);
  builder.where = vi.fn(() => builder);
  builder.orderBy = vi.fn(() => builder);
  builder.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
  return builder;
}

function context(): TrpcContext {
  return { user: { id: 7, openId: "operations-manager", role: "user", platformRole: "platform_user", name: "Gestor", email: "gestor@example.com", loginMethod: "manus", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

describe("agenda e pátio — busca operacional isolada", () => {
  beforeEach(() => {
    mocks.requirePermission.mockResolvedValue({ permissions: ["appointments.manage"] });
    mocks.getAccess.mockResolvedValue({ membership: { role: "admin" } });
    mocks.hasPermission.mockReturnValue(true);
  });

  it("aceita busca por cliente ou veículo na agenda dentro do período e tenant solicitados", async () => {
    const row = { appointment: { id: 31, tenantId: 4 }, customer: { id: 21, tenantId: 4, name: "Marina" }, vehicle: { id: 41, tenantId: 4, plate: "ABC1D23", make: "BMW", model: "320i" }, workOrder: null };
    mocks.db = { select: vi.fn(() => query([row])) };
    const caller = appointmentRouter.createCaller(context());
    const from = new Date("2026-08-25T00:00:00.000Z");
    const to = new Date("2026-08-31T23:59:59.999Z");

    await expect(caller.list({ tenantId: 4, from, to, search: "ABC1D23" })).resolves.toEqual([row]);
    expect(mocks.requirePermission).toHaveBeenCalledWith(expect.anything(), 4, "appointments.manage");
  });

  it("mantém a permissão do pátio e aceita busca por cliente ou veículo sem sair do tenant", async () => {
    const row = { workOrder: { id: 61, tenantId: 4, status: "in_service" }, customer: { id: 21, tenantId: 4, name: "Marina" }, vehicle: { id: 41, tenantId: 4, plate: "ABC1D23", make: "BMW", model: "320i" }, appointment: null };
    mocks.db = { select: vi.fn(() => query([row])) };
    const caller = workOrderRouter.createCaller(context());

    await expect(caller.kanban({ tenantId: 4, search: "Marina" })).resolves.toEqual([row]);
    expect(mocks.getAccess).toHaveBeenCalledWith(expect.anything(), 4);
    expect(mocks.hasPermission).toHaveBeenCalledWith(expect.anything(), "work_orders.manage");
  });
});
