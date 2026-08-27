import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseClient: vi.fn(),
  requireSupabaseTenantPermission: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("../_core/supabase", () => ({
  createSupabaseClient: mocks.createSupabaseClient,
}));

vi.mock("../supabaseTenantAccess", () => ({
  requireSupabaseTenantPermission: mocks.requireSupabaseTenantPermission,
}));

import { supabaseQuoteRequestRouter } from "./supabaseQuoteRequests";

const supabaseUser = {
  id: "f3b9d977-1a0c-407a-b56b-7ca7337d9e88",
  name: "Atendente",
  email: "atendente@oficina.test",
  platformRole: "platform_user" as const,
  accessToken: "token-supabase",
};

const preparation = {
  request: { id: 14, tenantId: 4, number: 102, status: "in_quoting", serviceLabel: "Instalação de downpipe", description: null, createdAt: "2026-08-27T12:00:00.000Z" },
  customer: { id: 7, name: "Cliente", whatsapp: "11999999999", email: null },
  vehicle: { id: 9, make: "BMW", model: "320i", modelYear: 2021, manufactureYear: 2021, plate: null, mileage: 45000, engine: null, notes: null },
  service: { id: 3, name: "Instalação de downpipe", description: null, estimatedMinutes: 120, laborPrice: 750 },
  suggestedItems: [
    { itemType: "service", productId: null, serviceId: 3, description: "Instalação de downpipe", quantity: 1, unitPrice: 750, availability: "not_applicable" },
    { itemType: "product", productId: 44, serviceId: null, description: "Junta", quantity: 1, unitPrice: 89.9, availability: "available" },
  ],
  subtotal: 839.9,
  total: 839.9,
} as const;

const draft = {
  id: 53,
  tenantId: 4,
  requestId: 14,
  number: 18,
  status: "draft",
  validUntil: "2026-09-03T12:00:00.000Z",
  total: 839.9,
} as const;

function context(user = supabaseUser) {
  return {
    req: {} as never,
    res: {} as never,
    user: null,
    supabaseUser: user,
  } as never;
}

describe("workspaceQuoteRequests.prepare", () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.requireSupabaseTenantPermission.mockReset().mockResolvedValue({ tenantId: 4 });
    mocks.createSupabaseClient.mockReset().mockReturnValue({ rpc: mocks.rpc });
  });

  it("nega a preparação sem uma identidade Supabase materializada", async () => {
    const caller = supabaseQuoteRequestRouter.createCaller(context(null as never));
    await expect(caller.prepare({ tenantId: 4, quoteRequestId: 14 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("exige a permissão comercial no tenant informado antes de consultar a RPC", async () => {
    mocks.requireSupabaseTenantPermission.mockRejectedValue(new TRPCError({ code: "FORBIDDEN", message: "Sem acesso ao tenant." }));
    const caller = supabaseQuoteRequestRouter.createCaller(context());

    await expect(caller.prepare({ tenantId: 4, quoteRequestId: 14 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.requireSupabaseTenantPermission).toHaveBeenCalledWith(supabaseUser, 4, "quotes.manage");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("chama somente a RPC Supabase com os IDs do tenant e da solicitação solicitados", async () => {
    mocks.rpc.mockResolvedValue({ data: preparation, error: null });
    const caller = supabaseQuoteRequestRouter.createCaller(context());

    await expect(caller.prepare({ tenantId: 4, quoteRequestId: 14 })).resolves.toEqual(preparation);
    expect(mocks.rpc).toHaveBeenCalledWith("workspace_prepare_quote_from_request", {
      target_tenant_id: 4,
      target_request_id: 14,
    });
  });

  it("rejeita uma resposta que não corresponda exatamente ao tenant e à solicitação solicitados", async () => {
    mocks.rpc.mockResolvedValue({ data: { ...preparation, request: { ...preparation.request, tenantId: 5 } }, error: null });
    const caller = supabaseQuoteRequestRouter.createCaller(context());

    await expect(caller.prepare({ tenantId: 4, quoteRequestId: 14 })).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "A preparação do orçamento retornou uma solicitação incompatível.",
    });
  });

  it("cria o rascunho somente pela RPC Supabase com os dados comerciais permitidos", async () => {
    mocks.rpc.mockResolvedValue({ data: draft, error: null });
    const caller = supabaseQuoteRequestRouter.createCaller(context());

    await expect(caller.createDraft({ tenantId: 4, quoteRequestId: 14, notes: "Conferir aplicação", terms: "Peças sob consulta", validUntil: "2026-09-03T12:00:00.000Z" })).resolves.toEqual(draft);
    expect(mocks.requireSupabaseTenantPermission).toHaveBeenCalledWith(supabaseUser, 4, "quotes.manage");
    expect(mocks.rpc).toHaveBeenCalledWith("workspace_create_quote_draft_from_request", {
      target_tenant_id: 4,
      target_request_id: 14,
      notes_input: "Conferir aplicação",
      terms_input: "Peças sob consulta",
      valid_until_input: "2026-09-03T12:00:00.000Z",
    });
  });

  it("nega a criação de rascunho sem uma identidade Supabase materializada", async () => {
    const caller = supabaseQuoteRequestRouter.createCaller(context(null as never));

    await expect(caller.createDraft({ tenantId: 4, quoteRequestId: 14 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejeita resposta de rascunho incompatível antes de chegar à interface", async () => {
    mocks.rpc.mockResolvedValue({ data: { ...draft, requestId: 15 }, error: null });
    const caller = supabaseQuoteRequestRouter.createCaller(context());

    await expect(caller.createDraft({ tenantId: 4, quoteRequestId: 14 })).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "A criação do rascunho retornou dados incompatíveis.",
    });
  });
});
