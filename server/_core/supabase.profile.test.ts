import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const maybeSingle = vi.fn();
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  const createClient = vi.fn(() => ({ from }));
  return { maybeSingle, eq, select, from, createClient };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClient,
}));

vi.mock("./env", () => ({
  ENV: {
    supabaseUrl: "https://project.supabase.co",
    supabasePublishableKey: "publishable-test-key",
    supabaseServiceRoleKey: "service-role-test-key",
  },
}));

import { getSupabaseProfile } from "./supabase";

describe("getSupabaseProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("limita a consulta ao profile da identidade autenticada, inclusive para Super Admin", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: { id: "profile-id", email: "admin@example.com", platform_role: "super_admin" },
      error: null,
    });

    await expect(getSupabaseProfile("access-token", "profile-id")).resolves.toEqual({
      id: "profile-id",
      email: "admin@example.com",
      platformRole: "super_admin",
    });

    expect(mocks.from).toHaveBeenCalledWith("profiles");
    expect(mocks.select).toHaveBeenCalledWith("id, email, platform_role");
    expect(mocks.eq).toHaveBeenCalledWith("id", "profile-id");
    expect(mocks.createClient).toHaveBeenCalledWith(
      "https://project.supabase.co",
      "service-role-test-key",
      expect.objectContaining({ auth: expect.objectContaining({ persistSession: false }) }),
    );
  });
});
