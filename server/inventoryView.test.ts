import { describe, expect, it } from "vitest";
import { inventoryBalanceLabels } from "../client/src/lib/inventoryView";

describe("inventoryBalanceLabels", () => {
  it("mantém os três saldos operacionais identificados na visualização móvel", () => {
    expect(inventoryBalanceLabels).toEqual(["Físico", "Reservado", "Disponível"]);
  });
});
