import { describe, expect, it } from "vitest";
import { getOperationNextAction, getYardStatusTone } from "./operationsQueue";

describe("operationsQueue", () => {
  it("indica a próxima etapa operacional para cada situação do pátio", () => {
    expect(getOperationNextAction("scheduled").title).toBe("Confirmar recebimento");
    expect(getOperationNextAction("awaiting_part").title).toBe("Acompanhar peça");
    expect(getOperationNextAction("completed").title).toBe("Preparar entrega");
  });

  it("atribui superfícies semânticas por etapa operacional", () => {
    expect(getYardStatusTone("in_service")).toContain("orange");
    expect(getYardStatusTone("completed")).toContain("emerald");
  });
});
