import { describe, expect, it } from "vitest";
import { getInventoryAvailability, getInventoryTone } from "./inventoryPriority";

describe("inventoryPriority", () => {
  it("classifica a disponibilidade sem expor dados financeiros", () => {
    expect(getInventoryAvailability(0, 5)).toMatchObject({ label: "Indisponível", tone: "critical" });
    expect(getInventoryAvailability(5, 5)).toMatchObject({ label: "Crítico", tone: "attention" });
    expect(getInventoryAvailability(6, 5)).toMatchObject({ label: "Disponível", tone: "normal" });
  });

  it("gera a superfície visual correspondente", () => {
    expect(getInventoryTone("critical")).toContain("red");
    expect(getInventoryTone("normal")).toContain("emerald");
  });
});
