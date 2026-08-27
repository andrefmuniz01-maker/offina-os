import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), permission: vi.fn() }));
vi.mock("../_core/supabase", () => ({ createSupabaseClient: vi.fn(() => ({ rpc: mocks.rpc })) }));
vi.mock("../supabaseTenantAccess", () => ({ requireSupabaseTenantPermission: mocks.permission }));

import { supabaseOperationsRouter } from "./supabaseOperations";

const user = { id: "dbbcbcad-23a2-4c39-ae56-82a159ad5389", accessToken: "test-token", platformRole: "platform_user" };
const validInput = { tenantId: 4, quoteId: 18, scheduledStart: "2026-09-01T13:00:00.000Z", scheduledEnd: "2026-09-01T14:00:00.000Z", bay: "2" };

describe("workspaceOperations.scheduleFromApprovedQuote", () => {
  beforeEach(() => { mocks.rpc.mockReset(); mocks.permission.mockReset(); mocks.permission.mockResolvedValue({}); });

  it("requer sessão Supabase e permissão de agenda antes da RPC", async () => {
    const caller = supabaseOperationsRouter.createCaller({ supabaseUser: null } as never);
    await expect(caller.scheduleFromApprovedQuote(validInput)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(mocks.permission).not.toHaveBeenCalled();
  });

  it("encaminha somente IDs Supabase e horário ISO para criar agenda e OS herdadas", async () => {
    mocks.rpc.mockResolvedValue({ data: { appointmentId: 31, workOrderId: 51, workOrderNumber: 14 }, error: null });
    const caller = supabaseOperationsRouter.createCaller({ supabaseUser: user } as never);
    await expect(caller.scheduleFromApprovedQuote(validInput)).resolves.toEqual({ appointmentId: 31, workOrderId: 51, workOrderNumber: 14 });
    expect(mocks.permission).toHaveBeenCalledWith(user, 4, "appointments.manage");
    expect(mocks.rpc).toHaveBeenCalledWith("workspace_schedule_approved_quote", expect.objectContaining({ target_tenant_id: 4, target_quote_id: 18, scheduled_start_input: validInput.scheduledStart, scheduled_end_input: validInput.scheduledEnd, bay_input: "2" }));
  });

  it("bloqueia horário invertido antes de gravar qualquer efeito operacional", async () => {
    const caller = supabaseOperationsRouter.createCaller({ supabaseUser: user } as never);
    await expect(caller.scheduleFromApprovedQuote({ ...validInput, scheduledEnd: validInput.scheduledStart })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejeita resposta que tente expor dados financeiros ou outros campos internos", async () => {
    mocks.rpc.mockResolvedValue({ data: { appointmentId: 31, workOrderId: 51, workOrderNumber: 14, estimatedCost: 80 }, error: null });
    const caller = supabaseOperationsRouter.createCaller({ supabaseUser: user } as never);
    await expect(caller.scheduleFromApprovedQuote(validInput)).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });
});
