import { describe, expect, it } from "vitest";
import { getPurchaseWorkspaceAction } from "./purchaseWorkspace";

describe("purchaseWorkspace", () => {
  it("prioriza conferência parcial antes de pedidos em aberto", () => {
    expect(getPurchaseWorkspaceAction(3, 1).title).toBe("Conferir recebimentos parciais");
    expect(getPurchaseWorkspaceAction(1, 0).title).toBe("Acompanhar pedidos em aberto");
    expect(getPurchaseWorkspaceAction(0, 0).title).toBe("Nenhum pedido pendente");
  });
});
