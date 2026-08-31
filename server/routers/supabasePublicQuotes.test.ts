import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createSupabaseServiceRoleClient: vi.fn(), rpc: vi.fn() }));
vi.mock("../_core/supabase", () => ({ createSupabaseServiceRoleClient: mocks.createSupabaseServiceRoleClient }));

import { supabasePublicQuoteRouter } from "./supabasePublicQuotes";

const token = "a".repeat(64);
const publicQuote = {
  workshop: { name: "Oficina", branding: { primaryColor: "#E84D1C", secondaryColor: "#171717", accentColor: "#F5B33A", publicTitle: null } },
  customer: { name: "Cliente" },
  vehicle: { make: "BMW", model: "320i", modelYear: 2023 },
  quote: { number: 18, status: "viewed", validUntil: "2026-09-03T12:00:00.000Z", total: 839.9, notes: null, terms: null, pdfStorageKey: null },
  items: [{ description: "Instalação", quantity: 1, unitPrice: 839.9, discount: 0, total: 839.9 }],
} as const;
const expectedPublicQuote = { ...publicQuote, quote: { number: 18, status: "viewed", validUntil: "2026-09-03T12:00:00.000Z", total: 839.9, notes: null, terms: null, pdfUrl: null } };
const approved = { status: "approved", idempotent: false } as const;

describe("publicQuotes.view", () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.createSupabaseServiceRoleClient.mockReset().mockReturnValue({ rpc: mocks.rpc });
  });

  it("consulta a RPC mínima por token sem passar IDs internos ao cliente", async () => {
    mocks.rpc.mockResolvedValue({ data: publicQuote, error: null });
    const caller = supabasePublicQuoteRouter.createCaller({} as never);
    await expect(caller.view({ token })).resolves.toEqual(expectedPublicQuote);
    expect(mocks.rpc).toHaveBeenCalledWith("public_quote_view", { token_input: token });
    expect(JSON.stringify(publicQuote)).not.toContain("tenantId");
    expect(JSON.stringify(publicQuote)).not.toContain("estimatedCost");
    expect(JSON.stringify(publicQuote)).not.toContain("whatsapp");
  });

  it("gera uma URL assinada de curta duração quando a proposta possui PDF gerado", async () => {
    mocks.rpc.mockResolvedValue({ data: { ...publicQuote, quote: { ...publicQuote.quote, pdfStorageKey: "quotes/4/53.pdf" } }, error: null });
    const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: "https://example.supabase.co/signed/quotes/4/53.pdf" }, error: null });
    mocks.createSupabaseServiceRoleClient.mockReturnValue({ rpc: mocks.rpc, storage: { from: () => ({ createSignedUrl }) } });
    const caller = supabasePublicQuoteRouter.createCaller({} as never);
    const result = await caller.view({ token });
    expect(result.quote.pdfUrl).toBe("https://example.supabase.co/signed/quotes/4/53.pdf");
    expect(createSignedUrl).toHaveBeenCalledWith("quotes/4/53.pdf", 300);
  });

  it("falha de forma neutra quando o backend não possui cliente de serviço", async () => {
    mocks.createSupabaseServiceRoleClient.mockReturnValue(null);
    const caller = supabasePublicQuoteRouter.createCaller({} as never);
    await expect(caller.view({ token })).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível consultar esta proposta agora." });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("não revela se um token ausente, expirado ou inválido existiu", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    const caller = supabasePublicQuoteRouter.createCaller({} as never);
    await expect(caller.view({ token })).rejects.toMatchObject({ code: "NOT_FOUND", message: "Proposta indisponível." });
  });

  it("rejeita uma resposta com campos internos ou contrato incompatível", async () => {
    mocks.rpc.mockResolvedValue({ data: { ...publicQuote, quote: { ...publicQuote.quote, status: "sent", tenantId: 4 } }, error: null });
    const caller = supabasePublicQuoteRouter.createCaller({} as never);
    await expect(caller.view({ token })).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });

  it("registra decisão sem expor ID interno, saldo ou token adicional", async () => {
    mocks.rpc.mockResolvedValue({ data: approved, error: null });
    const caller = supabasePublicQuoteRouter.createCaller({} as never);
    await expect(caller.decide({ token, decision: "approved" })).resolves.toEqual(approved);
    expect(mocks.rpc).toHaveBeenCalledWith("public_decide_quote", { token_input: token, decision_input: "approved" });
    expect(JSON.stringify(approved)).not.toContain("reservation");
    expect(JSON.stringify(approved)).not.toContain("token");
  });

  it("aceita somente o retorno idempotente mínimo de uma decisão já tomada", async () => {
    mocks.rpc.mockResolvedValue({ data: { status: "rejected", idempotent: true }, error: null });
    const caller = supabasePublicQuoteRouter.createCaller({} as never);
    await expect(caller.decide({ token, decision: "rejected" })).resolves.toEqual({ status: "rejected", idempotent: true });
  });

  it("rejeita uma resposta de decisão que tente expor reserva ou identificação interna", async () => {
    mocks.rpc.mockResolvedValue({ data: { ...approved, quoteId: 53, reservedProductCount: 1 }, error: null });
    const caller = supabasePublicQuoteRouter.createCaller({} as never);
    await expect(caller.decide({ token, decision: "approved" })).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });

  it("traduz a corrida de estoque para mensagem comercial segura", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "P0001" } });
    const caller = supabasePublicQuoteRouter.createCaller({} as never);
    await expect(caller.decide({ token, decision: "approved" })).rejects.toMatchObject({ code: "CONFLICT", message: "A disponibilidade foi alterada. Fale com a oficina para revisar a proposta." });
  });
});
