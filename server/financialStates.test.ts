import { describe, expect, it } from "vitest";
import { financialErrorMessage } from "../client/src/lib/financialStates";

describe("financialErrorMessage", () => {
  it("informa claramente quando o perfil não possui permissão financeira", () => {
    expect(financialErrorMessage("as receitas", "FORBIDDEN")).toBe("Seu perfil não possui permissão para visualizar as receitas.");
  });

  it("mantém falhas técnicas separadas de estado vazio e de permissão", () => {
    expect(financialErrorMessage("as despesas", "INTERNAL_SERVER_ERROR")).toBe("Não foi possível carregar as despesas. Tente novamente.");
  });
});
