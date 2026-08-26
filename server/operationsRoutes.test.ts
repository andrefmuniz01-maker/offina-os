import { describe, expect, it } from "vitest";
import { operationsRoutePaths } from "../client/src/lib/operationsRoutes";

describe("operationsRoutePaths", () => {
  it("mantém os caminhos de operação e agenda disponíveis para o pátio", () => {
    expect(operationsRoutePaths).toEqual(["/operacao", "/agenda"]);
  });
});
