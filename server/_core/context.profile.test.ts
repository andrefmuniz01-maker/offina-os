import { describe, expect, it } from "vitest";
import type { User } from "../../drizzle/schema";
import { applySupabaseProfileRole } from "./context";

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
});
