import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getUser: vi.fn() }));

vi.mock("./env", () => ({
  ENV: { supabaseUrl: "https://example.supabase.co", supabasePublishableKey: "pub-key", supabaseServiceRoleKey: "service-role-key" },
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ auth: { getUser: mocks.getUser } })),
}));

import { getSupabaseAuthUser } from "./supabase";

describe("getSupabaseAuthUser", () => {
  beforeEach(() => {
    mocks.getUser.mockReset();
  });

  it("retorna null quando o token é genuinamente rejeitado (expirado/inválido, erro 4xx)", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { message: "invalid JWT", status: 401 } });
    await expect(getSupabaseAuthUser("token")).resolves.toBeNull();
  });

  it("lança exceção em vez de retornar null quando a verificação falha por infraestrutura (sem 'status' de rejeição de token), para não ser confundida com 'sessão inválida'", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { message: "upstream connect error", status: 503 } });
    await expect(getSupabaseAuthUser("token")).rejects.toThrow(/upstream connect error/);
  });

  it("retorna o usuário normalmente quando a verificação é bem-sucedida", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-id", email: "a@b.com" } }, error: null });
    await expect(getSupabaseAuthUser("token")).resolves.toMatchObject({ id: "user-id" });
  });
});
