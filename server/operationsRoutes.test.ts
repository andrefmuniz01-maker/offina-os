import { describe, expect, it } from "vitest";
import { operationsRoutePaths, yardMobileScrollHint, yardRegionLabel } from "../client/src/lib/operationsRoutes";

describe("operationsRoutePaths", () => {
  it("mantém os caminhos de operação e agenda disponíveis para o pátio", () => {
    expect(operationsRoutePaths).toEqual(["/operacao", "/agenda"]);
  });

  it("mantém orientação textual e rótulo acessível para o pátio horizontal", () => {
    expect(yardMobileScrollHint).toContain("Deslize lateralmente");
    expect(yardRegionLabel).toContain("Pátio operacional");
  });
});
