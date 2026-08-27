import { describe, expect, it } from "vitest";
import { getApprovedQuoteIdFromSearch } from "./operationScheduleIntent";

describe("intenção de agendamento por orçamento", () => {
  it("aceita somente o identificador positivo e inteiro informado pela navegação interna", () => {
    expect(getApprovedQuoteIdFromSearch("?orcamento=42")).toBe("42");
    expect(getApprovedQuoteIdFromSearch("?outro=42")).toBe("");
    expect(getApprovedQuoteIdFromSearch("?orcamento=0")).toBe("");
    expect(getApprovedQuoteIdFromSearch("?orcamento=4.2")).toBe("");
    expect(getApprovedQuoteIdFromSearch("?orcamento=texto")).toBe("");
  });
});
