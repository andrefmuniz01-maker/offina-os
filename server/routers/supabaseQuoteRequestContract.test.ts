import { describe, expect, it } from "vitest";
import { parseWorkspaceQuotePreparation, parseWorkspaceQuoteRequestHistory, parseWorkspaceQuoteRequestList } from "./supabaseQuoteRequestContract";

const validItem = {
  request: { id: 14, tenantId: 4, number: 102, customerId: 7, vehicleId: 9, serviceId: null, requesterName: "Cliente", requesterWhatsapp: "11999999999", requesterEmail: null, serviceLabel: "Serviço personalizado", description: null, source: "public_link", status: "new", assignedToUserId: null, createdAt: "2026-08-27T12:00:00.000Z", updatedAt: "2026-08-27T12:00:00.000Z" },
  customer: { id: 7, name: "Cliente", whatsapp: "11999999999" },
  vehicle: { id: 9, make: "BMW", model: "320i", plate: null },
  assignedUser: null,
  queueMinutes: 10,
};

const validPreparation = {
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

  it("aceita a composição de orçamento sem expor custo, margem, reserva ou token público", () => {
    expect(parseWorkspaceQuotePreparation(validPreparation).success).toBe(true);
  });

  it("aceita a composição para qualquer etapa ainda não enviada ao cliente, não só em_orçamento", () => {
    for (const status of ["new", "in_analysis", "awaiting_information", "in_quoting", "ready"]) {
      const preparation = structuredClone(validPreparation);
      preparation.request.status = status;
      expect(parseWorkspaceQuotePreparation(preparation).success).toBe(true);
    }
  });

  it("rejeita composição de solicitação já enviada ao cliente e qualquer campo financeiro interno inesperado", () => {
    const wrongStatus = structuredClone(validPreparation);
    wrongStatus.request.status = "sent";
    expect(parseWorkspaceQuotePreparation(wrongStatus).success).toBe(false);

    const leakedCost = structuredClone(validPreparation) as typeof validPreparation & { estimatedCostTotal?: number };
    leakedCost.estimatedCostTotal = 420;
    expect(parseWorkspaceQuotePreparation(leakedCost).success).toBe(false);
  });
});
