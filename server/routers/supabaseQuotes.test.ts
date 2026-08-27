import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createSupabaseClient: vi.fn(), requireSupabaseTenantPermission: vi.fn(), rpc: vi.fn() }));
vi.mock("../_core/supabase", () => ({ createSupabaseClient: mocks.createSupabaseClient }));
vi.mock("../supabaseTenantAccess", () => ({ requireSupabaseTenantPermission: mocks.requireSupabaseTenantPermission }));

import { supabaseQuoteRouter } from "./supabaseQuotes";

const user = { id: "f3b9d977-1a0c-407a-b56b-7ca7337d9e88", name: "Atendente", email: "atendente@oficina.test", platformRole: "platform_user" as const, accessToken: "token-interno" };
const quote = { id: 53, tenantId: 4, number: 18, requestId: 14, status: "draft", subtotal: 839.9, discountTotal: 0, total: 839.9, validUntil: "2026-09-03T12:00:00.000Z", createdAt: "2026-08-27T12:00:00.000Z", updatedAt: "2026-08-27T12:00:00.000Z" } as const;
const row = { quote, customer: { id: 7, name: "Cliente", whatsapp: "11999999999" }, vehicle: { id: 9, make: "BMW", model: "320i", plate: null } } as const;
const detail = { quote: { ...quote, notes: null, terms: null }, customer: row.customer, vehicle: row.vehicle, items: [{ id: 71, itemType: "service", description: "Instalação", quantity: 1, unitPrice: 750, discount: 0, sortOrder: 0 }] } as const;
const discountUpdate = { id: 53, tenantId: 4, status: "draft", subtotal: 839.9, discountTotal: 40, total: 799.9, updatedAt: "2026-08-27T12:05:00.000Z" } as const;
const finalized = { id: 53, tenantId: 4, requestId: 14, status: "ready", updatedAt: "2026-08-27T12:06:00.000Z" } as const;

function context(supabaseUser = user) {
  return { req: {} as never, res: {} as never, user: null, supabaseUser } as never;
}

describe("workspaceQuotes", () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.createSupabaseClient.mockReset().mockReturnValue({ rpc: mocks.rpc });
    mocks.requireSupabaseTenantPermission.mockReset().mockResolvedValue({ tenantId: 4 });
  });

  it("exige sessão Supabase antes de consultar rascunhos", async () => {
    const caller = supabaseQuoteRouter.createCaller(context(null as never));
    await expect(caller.list({ tenantId: 4 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("exige quotes.manage no tenant antes da listagem", async () => {
    mocks.requireSupabaseTenantPermission.mockRejectedValue(new TRPCError({ code: "FORBIDDEN" }));
    const caller = supabaseQuoteRouter.createCaller(context());
    await expect(caller.list({ tenantId: 4 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("retorna somente a projeção comercial sem custo ou margem quando a RPC não os inclui", async () => {
    mocks.rpc.mockResolvedValue({ data: { items: [row], page: 1, pageSize: 25, hasMore: false }, error: null });
    const caller = supabaseQuoteRouter.createCaller(context());
    await expect(caller.list({ tenantId: 4 })).resolves.toEqual({ items: [row], page: 1, pageSize: 25, hasMore: false });
    expect(mocks.rpc).toHaveBeenCalledWith("workspace_list_quotes", { target_tenant_id: 4, target_status: null, search_input: null, page_input: 1, page_size_input: 25 });
  });

  it("rejeita detalhe que não corresponda ao tenant e orçamento solicitados", async () => {
    mocks.rpc.mockResolvedValue({ data: { ...detail, quote: { ...detail.quote, tenantId: 5 } }, error: null });
    const caller = supabaseQuoteRouter.createCaller(context());
    await expect(caller.detail({ tenantId: 4, quoteId: 53 })).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });

  it("encaminha somente descontos e controle de concorrência para a RPC de rascunho", async () => {
    mocks.rpc.mockResolvedValue({ data: discountUpdate, error: null });
    const caller = supabaseQuoteRouter.createCaller(context());
    await expect(caller.updateDraftDiscounts({ tenantId: 4, quoteId: 53, discounts: [{ quoteItemId: 71, discount: 40 }], expectedUpdatedAt: "2026-08-27T12:00:00.000Z" })).resolves.toEqual(discountUpdate);
    expect(mocks.rpc).toHaveBeenCalledWith("workspace_update_quote_draft_discounts", {
      target_tenant_id: 4,
      target_quote_id: 53,
      discounts_input: [{ quoteItemId: 71, discount: 40 }],
      expected_updated_at_input: "2026-08-27T12:00:00.000Z",
      override_reason_input: null,
    });
  });

  it("rejeita resposta de desconto vinculada a outro orçamento ou tenant", async () => {
    mocks.rpc.mockResolvedValue({ data: { ...discountUpdate, tenantId: 5 }, error: null });
    const caller = supabaseQuoteRouter.createCaller(context());
    await expect(caller.updateDraftDiscounts({ tenantId: 4, quoteId: 53, discounts: [{ quoteItemId: 71, discount: 40 }], expectedUpdatedAt: "2026-08-27T12:00:00.000Z" })).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });

  it("finaliza somente o rascunho solicitado pela RPC Supabase com controle de concorrência", async () => {
    mocks.rpc.mockResolvedValue({ data: finalized, error: null });
    const caller = supabaseQuoteRouter.createCaller(context());
    await expect(caller.finalizeDraft({ tenantId: 4, quoteId: 53, expectedUpdatedAt: "2026-08-27T12:05:00.000Z" })).resolves.toEqual(finalized);
    expect(mocks.rpc).toHaveBeenCalledWith("workspace_finalize_quote_draft", {
      target_tenant_id: 4,
      target_quote_id: 53,
      expected_updated_at_input: "2026-08-27T12:05:00.000Z",
    });
  });

  it("rejeita a finalização que retorna um orçamento de outro tenant", async () => {
    mocks.rpc.mockResolvedValue({ data: { ...finalized, tenantId: 5 }, error: null });
    const caller = supabaseQuoteRouter.createCaller(context());
    await expect(caller.finalizeDraft({ tenantId: 4, quoteId: 53, expectedUpdatedAt: "2026-08-27T12:05:00.000Z" })).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });
});
