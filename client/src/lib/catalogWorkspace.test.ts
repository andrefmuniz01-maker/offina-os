import { describe, expect, it } from "vitest";
import { getCatalogWorkspaceSummary } from "./catalogWorkspace";

describe("catalogWorkspace", () => {
  it("orienta a formação inicial do catálogo", () => {
    expect(getCatalogWorkspaceSummary({ products: 0, services: 2, kits: 0, suppliers: 0, customers: 0 }).nextAction).toBe("Cadastre o primeiro produto");
    expect(getCatalogWorkspaceSummary({ products: 1, services: 0, kits: 0, suppliers: 0, customers: 0 }).nextAction).toBe("Cadastre o primeiro serviço");
    expect(getCatalogWorkspaceSummary({ products: 2, services: 1, kits: 1, suppliers: 1, customers: 1 }).total).toBe(6);
  });
});
