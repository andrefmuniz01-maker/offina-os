import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ maybeSingle: vi.fn() }));

vi.mock("./env", () => ({
  ENV: { supabaseUrl: "https://example.supabase.co", supabasePublishableKey: "pub-key", supabaseServiceRoleKey: "service-role-key" },
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.maybeSingle }) }) }),
  })),
}));

import { getSupabaseProfile } from "./supabase";

describe("getSupabaseProfile", () => {
  beforeEach(() => {
    mocks.maybeSingle.mockReset();
  });

  it("retorna null somente quando o profile genuinamente não existe (sem erro reportado)", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(getSupabaseProfile("token", "user-id")).resolves.toBeNull();
  });

  it("lança exceção em vez de retornar null quando a consulta falha por infraestrutura, para não ser confundida com 'perfil inexistente'", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: { message: "canceling statement due to statement timeout", code: "57014" } });
    await expect(getSupabaseProfile("token", "user-id")).rejects.toThrow(/canceling statement due to statement timeout/);
  });

  it("retorna o profile normalmente quando a consulta é bem-sucedida", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { id: "user-id", email: "a@b.com", platform_role: "platform_user" }, error: null });
    await expect(getSupabaseProfile("token", "user-id")).resolves.toEqual({ id: "user-id", email: "a@b.com", platformRole: "platform_user" });
  });
});
