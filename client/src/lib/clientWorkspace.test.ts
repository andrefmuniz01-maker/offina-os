import { describe, expect, it } from "vitest";
import { getClientWorkspaceStep } from "./clientWorkspace";

describe("clientWorkspace", () => {
  it("orienta a próxima ação de atendimento conforme a seleção atual", () => {
    expect(getClientWorkspaceStep(false, 0, false).title).toBe("Selecionar cliente");
    expect(getClientWorkspaceStep(true, 0, false).title).toBe("Cadastrar primeiro veículo");
    expect(getClientWorkspaceStep(true, 1, false).title).toBe("Abrir veículo");
    expect(getClientWorkspaceStep(true, 1, true).title).toBe("Consultar histórico");
  });
});
