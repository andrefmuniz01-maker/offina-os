import { describe, expect, it } from "vitest";
import { getStagingValidationStep } from "./stagingValidation";

describe("staging validation matrix", () => {
  it("keeps the technician validation focused on an assigned work order", () => {
    expect(getStagingValidationStep("technician").assertion).toContain("ordem atribuída");
  });
});
