import { describe, expect, it } from "vitest";
import { getPublicQuoteStepIssue } from "./publicQuoteFlow";

describe("publicQuoteFlow", () => {
  const complete = { name: "Ana", whatsapp: "11999999999", make: "BMW", model: "320i" };

  it("orienta os dados obrigatórios em cada etapa", () => {
    expect(getPublicQuoteStepIssue(1, { ...complete, name: "" })).toContain("nome");
    expect(getPublicQuoteStepIssue(2, { ...complete, model: "" })).toContain("modelo");
    expect(getPublicQuoteStepIssue(3, complete)).toBeNull();
  });
});
