import { describe, expect, it } from "vitest";
import { buildReservationPlan, calculateRequestQueueMinutes, isQuoteTransitionAllowed, isRequestTransitionAllowed, renderQuoteMessage } from "./quotes";

describe("transições de solicitação de orçamento", () => {
  it("permite o fluxo comercial principal até envio", () => {
    expect(isRequestTransitionAllowed("new", "in_analysis")).toBe(true);
    expect(isRequestTransitionAllowed("in_analysis", "in_quoting")).toBe(true);
    expect(isRequestTransitionAllowed("in_quoting", "ready")).toBe(true);
    expect(isRequestTransitionAllowed("ready", "sent")).toBe(true);
  });

  it("bloqueia aprovação e envio fora da sequência", () => {
    expect(isRequestTransitionAllowed("new", "approved")).toBe(false);
    expect(isRequestTransitionAllowed("awaiting_information", "sent")).toBe(false);
    expect(isRequestTransitionAllowed("approved", "in_quoting")).toBe(false);
  });

  it("permite reabertura de uma solicitação recusada para novo orçamento", () => {
    expect(isRequestTransitionAllowed("rejected", "in_quoting")).toBe(true);
  });
});

describe("tempo em fila de solicitação", () => {
  it("usa a última mudança de status e ignora atualizações posteriores de responsável ou observação", () => {
    const createdAt = new Date("2026-08-25T10:00:00.000Z");
    const lastStatusChangedAt = new Date("2026-08-25T11:15:00.000Z");
    const afterAssignmentOrNote = new Date("2026-08-25T11:55:00.000Z");

    expect(calculateRequestQueueMinutes(createdAt, lastStatusChangedAt, afterAssignmentOrNote)).toBe(40);
  });

  it("considera a criação como início da fila quando ainda não ocorreu mudança de status", () => {
    expect(calculateRequestQueueMinutes(new Date("2026-08-25T10:00:00.000Z"), undefined, new Date("2026-08-25T10:07:00.000Z"))).toBe(7);
  });
});

describe("reserva criada na aprovação de orçamento", () => {
  it("consolida a quantidade de produtos repetidos e respeita o saldo disponível", () => {
    const plan = buildReservationPlan(
      [{ productId: 7, quantity: "1.000" }, { productId: 7, quantity: "2.000" }, { productId: 8, quantity: "1.000" }],
      [{ productId: 7, physicalQuantity: "5.000", reservedQuantity: "1.000" }, { productId: 8, physicalQuantity: "1.000", reservedQuantity: "0.000" }],
    );
    expect(plan).toEqual([
      { productId: 7, quantity: 3, available: 4, reservable: true },
      { productId: 8, quantity: 1, available: 1, reservable: true },
    ]);
  });

  it("identifica a indisponibilidade antes de criar qualquer reserva", () => {
    const plan = buildReservationPlan(
      [{ productId: 7, quantity: "3.000" }, { productId: 7, quantity: "2.000" }],
      [{ productId: 7, physicalQuantity: "5.000", reservedQuantity: "1.000" }],
    );
    expect(plan[0]?.reservable).toBe(false);
  });
});

describe("modelo manual de mensagem de orçamento", () => {
  const values = { client: "Marina", vehicle: "BMW 320i", total: "R$ 1.250,00", link: "/orcamento/token-seguro", workshop: "Oficina Centro" };

  it("substitui apenas os placeholders públicos permitidos na configuração do tenant", () => {
    expect(renderQuoteMessage("{{oficina}}: {{cliente}}, {{veiculo}} — {{total}} — {{link}}", values)).toBe("Oficina Centro: Marina, BMW 320i — R$ 1.250,00 — /orcamento/token-seguro");
  });

  it("mantém um texto padrão seguro quando a oficina ainda não configurou um modelo", () => {
    expect(renderQuoteMessage(null, values)).toContain("Olá, Marina!");
    expect(renderQuoteMessage(null, values)).toContain("/orcamento/token-seguro");
  });
});

describe("transições de orçamento", () => {
  it("permite apenas a progressão comercial esperada", () => {
    expect(isQuoteTransitionAllowed("draft", "ready")).toBe(true);
    expect(isQuoteTransitionAllowed("ready", "sent")).toBe(true);
    expect(isQuoteTransitionAllowed("sent", "viewed")).toBe(true);
    expect(isQuoteTransitionAllowed("viewed", "approved")).toBe(true);
  });

  it("bloqueia saltos e mudanças após aprovação", () => {
    expect(isQuoteTransitionAllowed("draft", "approved")).toBe(false);
    expect(isQuoteTransitionAllowed("ready", "approved")).toBe(false);
    expect(isQuoteTransitionAllowed("approved", "sent")).toBe(false);
  });
});
