import { describe, expect, it } from "vitest";
import { getQuoteValidity } from "./publicQuoteDecision";

describe("publicQuoteDecision", () => {
  it("destaca validade no mesmo dia e próximos vencimentos", () => {
    const now = new Date("2026-08-26T12:00:00Z");
    expect(getQuoteValidity("2026-08-26T18:00:00Z", now).label).toBe("Vence hoje");
    expect(getQuoteValidity("2026-08-28T12:00:00Z", now).tone).toBe("attention");
  });
});
