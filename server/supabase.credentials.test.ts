import { describe, expect, it } from "vitest";

describe("Supabase public credentials", () => {
  it("reaches the Auth settings endpoint with the configured publishable key", async () => {
    const url = process.env.VITE_SUPABASE_URL;
    const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    expect(url).toMatch(/^https:\/\/[a-z0-9-]+\.supabase\.co$/i);
    expect(publishableKey).toBeTruthy();

    const response = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: publishableKey! },
    });

    expect(response.ok).toBe(true);
  });
});
