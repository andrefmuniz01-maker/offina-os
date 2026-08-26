import { describe, expect, it } from "vitest";
import { periodBounds } from "./routers/management";

describe("periodBounds", () => {
  it("delimita o mês de referência em UTC sem incluir o mês seguinte", () => {
    const bounds = periodBounds(new Date("2026-02-18T16:30:00.000Z"));
    expect(bounds).toEqual({ start: new Date("2026-02-01T00:00:00.000Z"), end: new Date("2026-03-01T00:00:00.000Z") });
  });
});
