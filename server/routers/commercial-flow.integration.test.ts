import type { TrpcContext } from "../_core/context";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: null as any,
  audit: vi.fn(),
  requirePermission: vi.fn(),
}));

vi.mock("../db", () => ({ getDb: vi.fn(async () => mocks.db), writeAuditLog: mocks.audit }));
vi.mock("../tenantAccess", () => ({ getTenantAccess: vi.fn(), hasPermission: vi.fn(), requireTenantPermission: mocks.requirePermission }));

import { appointmentRouter } from "./operations";
import { quoteRouter } from "./quotes";

function chain(result: unknown) {
  const query: any = {};
  query.from = vi.fn(() => query);
  query.innerJoin = vi.fn(() => query);
  query.leftJoin = vi.fn(() => query);
  query.where = vi.fn(() => query);
  query.limit = vi.fn(async () => result);
  query.orderBy = vi.fn(async () => result);
  query.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
  return query;
}

function buildDb(globalResults: unknown[], transactionResults: unknown[], insertIds: number[]) {
  const inserts: unknown[] = [];
  const updates: unknown[] = [];
  const tx = {
    select: vi.fn(() => chain(transactionResults.shift() ?? [])),
    insert: vi.fn(() => ({ values: vi.fn(async (value: unknown) => { inserts.push(value); return [{ insertId: insertIds.shift() ?? 1 }]; }) })),
    update: vi.fn(() => ({ set: vi.fn((value: unknown) => ({ where: vi.fn(async () => { updates.push(value); return [{ affectedRows: 1 }]; }) })) })),
  };
  return { select: vi.fn(() => chain(globalResults.shift() ?? [])), transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)), inserts: () => inserts, updates: () => updates };
}

const publicContext: TrpcContext = { user: null, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] };
const staffContext: TrpcContext = { user: { id: 7, openId: "operator", role: "user", platformRole: "platform_user", name: "Gestor", email: "gestor@example.com", loginMethod: "manus", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] };

describe("fluxo comercial — aprovação até agenda e OS", () => {
  beforeEach(() => {
    mocks.audit.mockReset();
    mocks.requirePermission.mockResolvedValue({ permissions: ["appointments.manage"] });
  });

  it("preserva o mesmo orçamento, reservas e itens ao criar agendamento e ordem de serviço", async () => {
    const quote = { id: 81, tenantId: 4, quoteRequestId: 9, publicToken: "link-seguro", publicTokenExpiresAt: new Date("2026-12-01T00:00:00.000Z"), status: "sent", customerId: 20, vehicleId: 31, total: "680.00", estimatedCostTotal: "410.00" };
    const quoteItems = [{ tenantId: 4, quoteId: 81, itemType: "product", productId: 55, serviceId: null, quantity: "2.000", description: "Componente", unitPrice: "240.00", unitCost: "160.00" }, { tenantId: 4, quoteId: 81, itemType: "service", productId: null, serviceId: 5, quantity: "1.000", description: "Instalação", unitPrice: "200.00", unitCost: "90.00" }];
    mocks.db = buildDb([[{ quote }], [{ ...quote, status: "approved" }]], [quoteItems, [{ id: 15, tenantId: 4, productId: 55, physicalQuantity: "8.000", reservedQuantity: "0.000" }], [], [], [{ value: 14 }], quoteItems], [1, 1, 1, 401, 402, 403, 901]);

    await expect(quoteRouter.createCaller(publicContext).publicDecision({ token: "link-seguro", decision: "approved" })).resolves.toEqual({ status: "approved", idempotent: false });
    const schedule = await appointmentRouter.createCaller(staffContext).scheduleFromQuote({ tenantId: 4, quoteId: 81, scheduledStart: new Date("2026-09-02T12:00:00.000Z"), scheduledEnd: new Date("2026-09-02T14:00:00.000Z"), bay: "Baia 2" });

    expect(schedule).toEqual({ appointmentId: 901, workOrderId: 401, workOrderNumber: 14 });
    expect(mocks.db.inserts()).toEqual(expect.arrayContaining([
      expect.objectContaining({ tenantId: 4, quoteId: 81, productId: 55, quantity: "2.000" }),
      expect.arrayContaining([expect.objectContaining({ tenantId: 4, workOrderId: 401, productId: 55, description: "Componente" }), expect.objectContaining({ tenantId: 4, workOrderId: 401, serviceId: 5, description: "Instalação" })]),
      expect.objectContaining({ tenantId: 4, quoteId: 81, workOrderId: 401, customerId: 20, vehicleId: 31, bay: "Baia 2" }),
    ]));
    expect(mocks.db.updates()).toEqual(expect.arrayContaining([expect.objectContaining({ workOrderId: 401 })]));
  });

  it("bloqueia um segundo orçamento para a mesma solicitação antes de criar itens ou eventos", async () => {
    const request = { id: 9, tenantId: 4, serviceId: 5, customerId: 20, vehicleId: 31, status: "in_quoting" };
    const service = { id: 5, tenantId: 4, active: true, name: "Instalação", laborPrice: "200.00", estimatedCost: "90.00" };
    mocks.db = buildDb([[request], [service], [], []], [[{ id: 81, number: 14, status: "ready" }]], []);

    await expect(quoteRouter.createCaller(staffContext).createFromSuggestion({ tenantId: 4, quoteRequestId: 9 })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mocks.db.inserts()).toEqual([]);
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("bloqueia a geração antecipada de proposta antes da etapa Em orçamento", async () => {
    const request = { id: 9, tenantId: 4, serviceId: 5, customerId: 20, vehicleId: 31, status: "in_analysis" };
    mocks.db = buildDb([[request]], [], []);

    await expect(quoteRouter.createCaller(staffContext).createFromSuggestion({ tenantId: 4, quoteRequestId: 9 })).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("Em orçamento") });
    expect(mocks.db.inserts()).toEqual([]);
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});
