import { describe, expect, it } from "vitest";
import { buildReservationPlan, isRequestTransitionAllowed } from "./quotes";

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
