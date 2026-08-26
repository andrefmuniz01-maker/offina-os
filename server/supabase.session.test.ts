import { describe, expect, it } from "vitest";
import { getBearerToken } from "./_core/supabase";

describe("Supabase session transport", () => {
  it("accepts only a non-empty Bearer token from Supabase", () => {
    expect(getBearerToken("Bearer supabase-access-token")).toBe("supabase-access-token");
    expect(getBearerToken("Bearer    ")).toBeNull();
    expect(getBearerToken("Basic credentials")).toBeNull();
    expect(getBearerToken(undefined)).toBeNull();
  });
});
