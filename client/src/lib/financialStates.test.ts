import { describe, expect, it } from "vitest";
import { financialErrorMessage, hasFinancialPermissionError } from "./financialStates";

describe("estados de acesso financeiro", () => {
  it("mantém separados erro de autorização e indisponibilidade", () => {
    expect(hasFinancialPermissionError(undefined, "FORBIDDEN")).toBe(true);
    expect(hasFinancialPermissionError("INTERNAL_SERVER_ERROR")).toBe(false);
    expect(financialErrorMessage("as receitas", "FORBIDDEN")).toContain("não possui permissão");
  });
});
