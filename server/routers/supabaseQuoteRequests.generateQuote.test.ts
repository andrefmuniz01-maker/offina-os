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

const generated = {
  id: 73,
  tenantId: 4,
  requestId: 14,
  status: "ready",
  updatedAt: "2026-08-31T21:14:09.142088Z",
  total: 710,
} as const;

function context(user = supabaseUser) {
  return {
    req: {} as never,
    res: {} as never,
    user: null,
    supabaseUser: user,
  } as never;
}

describe("workspaceQuoteRequests.generateQuote", () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.requireSupabaseTenantPermission.mockReset().mockResolvedValue({ tenantId: 4 });
    mocks.createSupabaseClient.mockReset().mockReturnValue({ rpc: mocks.rpc });
  });

  it("nega a geração sem uma identidade Supabase materializada", async () => {
    const caller = supabaseQuoteRequestRouter.createCaller(context(null as never));
    await expect(caller.generateQuote({ tenantId: 4, quoteRequestId: 14 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("exige a permissão comercial no tenant informado antes de chamar a RPC", async () => {
    mocks.requireSupabaseTenantPermission.mockRejectedValue(new TRPCError({ code: "FORBIDDEN", message: "Sem acesso ao tenant." }));
    const caller = supabaseQuoteRequestRouter.createCaller(context());

    await expect(caller.generateQuote({ tenantId: 4, quoteRequestId: 14 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.requireSupabaseTenantPermission).toHaveBeenCalledWith(supabaseUser, 4, "quotes.manage");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("chama a RPC de geração com os IDs do tenant e da solicitação e devolve o orçamento pronto, sem enviar", async () => {
    mocks.rpc.mockResolvedValue({ data: generated, error: null });
    const caller = supabaseQuoteRequestRouter.createCaller(context());

    await expect(caller.generateQuote({ tenantId: 4, quoteRequestId: 14 })).resolves.toEqual(generated);
    expect(mocks.rpc).toHaveBeenCalledWith("workspace_generate_quote_from_request", {
      target_tenant_id: 4,
      target_request_id: 14,
    });
  });

  it("propaga como CONFLICT a falha de estoque insuficiente reportada pelo banco", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "Estoque indisponível para finalizar a proposta: Filtro de cabine" } });
    const caller = supabaseQuoteRequestRouter.createCaller(context());

    await expect(caller.generateQuote({ tenantId: 4, quoteRequestId: 14 })).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Estoque indisponível para finalizar a proposta: Filtro de cabine",
    });
  });

  it("rejeita uma resposta que não corresponda ao tenant e à solicitação solicitados", async () => {
    mocks.rpc.mockResolvedValue({ data: { ...generated, requestId: 99 }, error: null });
    const caller = supabaseQuoteRequestRouter.createCaller(context());

    await expect(caller.generateQuote({ tenantId: 4, quoteRequestId: 14 })).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "A geração da proposta retornou dados incompatíveis.",
    });
  });

  it("rejeita uma resposta que já esteja marcada como enviada (o RPC não deve mais enviar sozinho)", async () => {
    mocks.rpc.mockResolvedValue({ data: { ...generated, status: "sent" }, error: null });
    const caller = supabaseQuoteRequestRouter.createCaller(context());

    await expect(caller.generateQuote({ tenantId: 4, quoteRequestId: 14 })).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
    });
  });
});
