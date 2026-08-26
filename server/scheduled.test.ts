import { describe, expect, it } from "vitest";
import { getOperationalScanCutoff, shouldCreateInternalNotification } from "./scheduled";

describe("operational scan safeguards", () => {
  it("does not duplicate an internal alert inside the cooldown window", () => {
    expect(shouldCreateInternalNotification(0)).toBe(true);
    expect(shouldCreateInternalNotification(1)).toBe(false);
  });

  it("identifies requests waiting longer than forty-eight hours", () => {
    const reference = new Date("2026-08-26T12:00:00.000Z");
    expect(getOperationalScanCutoff(reference).toISOString()).toBe("2026-08-24T12:00:00.000Z");
  });
});
