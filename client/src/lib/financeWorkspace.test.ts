import { describe, expect, it } from "vitest";
import { getFinanceWorkspaceAction } from "./financeWorkspace";

describe("financeWorkspace", () => {
  it("prioriza recebimentos antes de compromissos planejados", () => {
    expect(getFinanceWorkspaceAction(2, 1).title).toBe("Confirmar recebimentos");
    expect(getFinanceWorkspaceAction(0, 1).title).toBe("Revisar compromissos");
    expect(getFinanceWorkspaceAction(0, 0).title).toBe("Financeiro em dia");
  });
});
