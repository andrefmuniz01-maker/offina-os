import { beforeEach, describe, expect, it, vi } from "vitest";

const maybeSingle = vi.fn();
const eq = vi.fn(() => ({ maybeSingle }));
const select = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ select }));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ from })),
}));

vi.mock("./env", () => ({
  ENV: {
    supabaseUrl: "https://project.supabase.co",
    supabasePublishableKey: "publishable-test-key",
  },
}));

import { getSupabaseProfile } from "./supabase";

describe("getSupabaseProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("limita a consulta ao profile da identidade autenticada, inclusive para Super Admin", async () => {
    maybeSingle.mockResolvedValue({
      data: { id: "profile-id", email: "admin@example.com", platform_role: "super_admin" },
      error: null,
    });

    await expect(getSupabaseProfile("access-token", "profile-id")).resolves.toEqual({
      id: "profile-id",
      email: "admin@example.com",
      platformRole: "super_admin",
    });

    expect(from).toHaveBeenCalledWith("profiles");
    expect(select).toHaveBeenCalledWith("id, email, platform_role");
    expect(eq).toHaveBeenCalledWith("id", "profile-id");
  });
});
