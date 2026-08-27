import { describe, expect, it, vi } from "vitest";
import { signOutSupabaseSession } from "./useAuth";

describe("signOutSupabaseSession", () => {
  it("encerra a sessão quando o Supabase não retorna erro", async () => {
    const signOut = vi.fn().mockResolvedValue({ error: null });

    await expect(signOutSupabaseSession(signOut)).resolves.toBeUndefined();
    expect(signOut).toHaveBeenCalledOnce();
  });

  it("propaga o erro retornado pelo Supabase sem limpar estado local indevidamente", async () => {
    const error = new Error("Sessão indisponível");
    const signOut = vi.fn().mockResolvedValue({ error });

    await expect(signOutSupabaseSession(signOut)).rejects.toBe(error);
    expect(signOut).toHaveBeenCalledOnce();
  });
});
