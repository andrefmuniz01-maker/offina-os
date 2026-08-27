import { describe, expect, it } from "vitest";
import { toPublicWorkshopCatalog } from "./quotes";

describe("toPublicWorkshopCatalog", () => {
  it("não expõe identificadores internos na resposta pública", () => {
    expect(toPublicWorkshopCatalog({ name: "Oficina Central", branding: { publicTitle: "Central" } })).toEqual({
      name: "Oficina Central",
      branding: { publicTitle: "Central" },
    });
  });
});
