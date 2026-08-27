import { describe, expect, it } from "vitest";
import { parseWorkspaceQuoteRequestHistory, parseWorkspaceQuoteRequestList } from "./supabaseQuoteRequestContract";

const validItem = {
  request: { id: 14, tenantId: 4, number: 102, customerId: 7, vehicleId: 9, serviceId: null, requesterName: "Cliente", requesterWhatsapp: "11999999999", requesterEmail: null, serviceLabel: "Serviço personalizado", description: null, source: "public_link", status: "new", assignedToUserId: null, createdAt: "2026-08-27T12:00:00.000Z", updatedAt: "2026-08-27T12:00:00.000Z" },
  customer: { id: 7, name: "Cliente", whatsapp: "11999999999" },
  vehicle: { id: 9, make: "BMW", model: "320i", plate: null },
  assignedUser: null,
  queueMinutes: 10,
};

describe("contrato da fila de solicitações Supabase", () => {
  it("aceita a projeção paginada esperada pela interface comercial", () => {
    expect(parseWorkspaceQuoteRequestList({ items: [validItem], page: 1, pageSize: 12, hasMore: false }).success).toBe(true);
  });

  it("rejeita itens sem tenant ou com responsável fora do formato UUID", () => {
    const invalid = structuredClone(validItem);
    invalid.request.tenantId = 0;
    invalid.assignedUser = { id: "membro-invalido", name: "Atendente" };
    expect(parseWorkspaceQuoteRequestList({ items: [invalid], page: 1, pageSize: 12, hasMore: false }).success).toBe(false);
  });

  it("aceita apenas eventos de histórico com identidade e instante definidos", () => {
    expect(parseWorkspaceQuoteRequestHistory([{ id: 1, type: "status_changed", metadata: { from: "new", to: "in_analysis" }, createdAt: "2026-08-27T12:00:00.000Z" }]).success).toBe(true);
    expect(parseWorkspaceQuoteRequestHistory([{ type: "status_changed" }]).success).toBe(false);
  });
});
