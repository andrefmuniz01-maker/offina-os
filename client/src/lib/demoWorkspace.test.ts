import { describe, expect, it } from "vitest";
import { canAccessDemoModule, getDemoStateCopy } from "./demoWorkspace";

describe("demo workspace access", () => {
  it("preserva a limitação do técnico aos módulos de execução", () => {
    expect(canAccessDemoModule("technician", "workOrder")).toBe(true);
    expect(canAccessDemoModule("technician", "quotes")).toBe(false);
  });

  it("expõe instruções seguras para o estado vazio", () => {
    expect(getDemoStateCopy("empty").detail).toContain("sem inventar clientes");
  });
});
