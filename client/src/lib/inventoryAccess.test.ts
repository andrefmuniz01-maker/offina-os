import { describe, expect, it } from "vitest";
import { getInventoryAccessMessage } from "./inventoryAccess";

describe("mensagens de acesso ao inventário", () => {
  it("diferencia a falta de permissão de uma indisponibilidade operacional", () => {
    expect(getInventoryAccessMessage("FORBIDDEN")).toContain("não possui acesso");
    expect(getInventoryAccessMessage("INTERNAL_SERVER_ERROR")).toContain("Não foi possível carregar");
  });
});
