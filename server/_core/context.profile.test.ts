import { describe, expect, it } from "vitest";
import type { User } from "../../drizzle/schema";
import { applySupabaseProfileRole, isSupabaseProfileIdentityMatch } from "./context";

const legacyUser: User = {
  id: 1,
  openId: "legacy-felipe",
  name: "Felipe",
  email: "felipefmuniz@gmail.com",
  loginMethod: "google",
  role: "user",
  platformRole: "platform_user",
  createdAt: new Date("2026-08-26T00:00:00.000Z"),
  updatedAt: new Date("2026-08-26T00:00:00.000Z"),
  lastSignedIn: new Date("2026-08-26T00:00:00.000Z"),
};

describe("applySupabaseProfileRole", () => {
  it("prioriza o papel conferido pelo profile Supabase sobre o papel legado", () => {
    const resolved = applySupabaseProfileRole(legacyUser, {
      id: "c577d57b-6375-431d-8549-971a4b20c0ed",
      email: "felipefmuniz@gmail.com",
      platformRole: "super_admin",
    });

    expect(resolved?.platformRole).toBe("super_admin");
    expect(resolved?.id).toBe(legacyUser.id);
  });

  it("nega o contexto legado quando o profile Supabase não está disponível", () => {
    expect(applySupabaseProfileRole(legacyUser, null)).toBeNull();
    expect(applySupabaseProfileRole(null, null)).toBeNull();
  });

  it("aceita somente o profile que corresponde ao id e e-mail autenticados pelo token", () => {
    const profile = { id: "c577d57b-6375-431d-8549-971a4b20c0ed", email: "felipefmuniz@gmail.com", platformRole: "super_admin" as const };
    expect(isSupabaseProfileIdentityMatch({ id: profile.id, email: "FelipeFMuniz@gmail.com" }, profile)).toBe(true);
    expect(isSupabaseProfileIdentityMatch({ id: "outra-identidade", email: profile.email }, profile)).toBe(false);
    expect(isSupabaseProfileIdentityMatch({ id: profile.id, email: "outro@example.com" }, profile)).toBe(false);
    expect(isSupabaseProfileIdentityMatch({ id: profile.id, email: null }, profile)).toBe(false);
  });

  it("recusa um papel global fora da enumeração autorizada, mesmo se id e e-mail coincidirem", () => {
    const profile = {
      id: "c577d57b-6375-431d-8549-971a4b20c0ed",
      email: "felipefmuniz@gmail.com",
      platformRole: "finance_admin",
    } as unknown as Parameters<typeof isSupabaseProfileIdentityMatch>[1];

    expect(isSupabaseProfileIdentityMatch({ id: "c577d57b-6375-431d-8549-971a4b20c0ed", email: "felipefmuniz@gmail.com" }, profile)).toBe(false);
  });
});
