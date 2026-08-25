import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";

const mocks = vi.hoisted(() => ({
  db: null as any,
  audit: vi.fn(),
  requirePermission: vi.fn(),
}));

vi.mock("../db", () => ({ getDb: vi.fn(async () => mocks.db), writeAuditLog: mocks.audit }));
vi.mock("../tenantAccess", () => ({ requireTenantPermission: mocks.requirePermission, getTenantAccess: vi.fn(), hasPermission: vi.fn() }));

import { appointmentRouter } from "./operations";

function chain(result: unknown) {
  const query: any = {};
  query.from = vi.fn(() => query);
  query.where = vi.fn(() => query);
  query.limit = vi.fn(async () => result);
  query.orderBy = vi.fn(async () => result);
  query.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
  return query;
}

function buildDb(selectResults: unknown[], insertResults: number[]) {
  const inserts: unknown[] = []; const updates: unknown[] = [];
  const select = vi.fn(() => chain(selectResults.shift() ?? []));
  const tx = {
    select,
    insert: vi.fn(() => ({ values: vi.fn(async (value: unknown) => { inserts.push(value); return [{ insertId: insertResults.shift() ?? 1 }]; }) })),
    update: vi.fn(() => ({ set: vi.fn((value: unknown) => ({ where: vi.fn(async () => { updates.push(value); return [{ affectedRows: 1 }]; }) })) })),
  };
  return { select, transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)), inserts: () => inserts, updates: () => updates };
}

function context(): TrpcContext {
  return { user: { id: 5, openId: "operator", role: "user", platformRole: "platform_user", name: "Operator", email: "operator@example.com", loginMethod: "manus", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

const approvedQuote = { id: 70, tenantId: 4, status: "approved", customerId: 20, vehicleId: 31, total: "680.00", estimatedCostTotal: "410.00" };
const quoteItems = [
  { tenantId: 4, productId: 9, serviceId: null, itemType: "product", description: "Componente", quantity: "2.000", unitPrice: "240.00", unitCost: "160.00" },
  { tenantId: 4, productId: null, serviceId: 5, itemType: "service", description: "Instalação", quantity: "1.000", unitPrice: "200.00", unitCost: "90.00" },
];

describe("appointments.scheduleFromQuote — integração tRPC simulada", () => {
  beforeEach(() => { mocks.audit.mockReset(); mocks.requirePermission.mockResolvedValue({ permissions: ["appointments.manage"] }); });

  it("cria OS, checklist, itens herdados e agendamento a partir de orçamento aprovado", async () => {
    mocks.db = buildDb([[approvedQuote], [], [{ value: 14 }], quoteItems], [401, 402, 403, 901]);
    const caller = appointmentRouter.createCaller(context());
    const start = new Date("2026-09-02T12:00:00.000Z");
    const end = new Date("2026-09-02T14:00:00.000Z");

    const result = await caller.scheduleFromQuote({ tenantId: 4, quoteId: 70, scheduledStart: start, scheduledEnd: end, bay: "Baia 2" });

    expect(result).toEqual({ appointmentId: 901, workOrderId: 401, workOrderNumber: 14 });
    expect(mocks.db.inserts()).toEqual(expect.arrayContaining([
      expect.objectContaining({ tenantId: 4, quoteId: 70, customerId: 20, vehicleId: 31, estimatedTotal: "680.00" }),
      expect.arrayContaining([expect.objectContaining({ workOrderId: 401, description: "Componente", productId: 9 }), expect.objectContaining({ workOrderId: 401, description: "Instalação", serviceId: 5 })]),
      expect.objectContaining({ tenantId: 4, quoteId: 70, workOrderId: 401, customerId: 20, vehicleId: 31, bay: "Baia 2" }),
    ]));
    expect(mocks.db.updates()).toEqual(expect.arrayContaining([expect.objectContaining({ workOrderId: 401 })]));
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 4, action: "appointment.created_from_quote", entityId: 901, metadata: { quoteId: 70, workOrderId: 401 } }));
  });

  it("não inicia o encadeamento quando o orçamento não pertence ao tenant", async () => {
    mocks.db = buildDb([[]], []);
    const caller = appointmentRouter.createCaller(context());
    await expect(caller.scheduleFromQuote({ tenantId: 4, quoteId: 999, scheduledStart: new Date("2026-09-02T12:00:00.000Z"), scheduledEnd: new Date("2026-09-02T14:00:00.000Z") })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.db.transaction).not.toHaveBeenCalled();
  });
});
