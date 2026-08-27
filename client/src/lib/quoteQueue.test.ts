import { describe, expect, it } from "vitest";
import { getQuoteNextAction, getQuoteStatusTone, getQuoteValidityState } from "./quoteQueue";

describe("quoteQueue", () => {
  it("orienta a próxima ação de acordo com o estágio comercial", () => {
    expect(getQuoteNextAction("ready").title).toBe("Preparar envio");
    expect(getQuoteNextAction("viewed").title).toBe("Conduzir decisão");
    expect(getQuoteNextAction("approved").title).toBe("Agendar execução");
  });

  it("sinaliza validade e status de forma determinística", () => {
    const now = new Date("2026-08-26T12:00:00.000Z");
    expect(getQuoteValidityState("2026-08-26T18:00:00.000Z", now)).toMatchObject({ label: "Vence hoje", urgency: "attention" });
    expect(getQuoteValidityState("2026-08-29T12:00:00.000Z", now).urgency).toBe("attention");
    expect(getQuoteValidityState("2026-08-25T12:00:00.000Z", now).urgency).toBe("critical");
    expect(getQuoteStatusTone("sent")).toContain("sky");
    expect(getQuoteStatusTone("approved")).toContain("emerald");
    expect(getQuoteStatusTone("rejected")).toContain("red");
  });
});
