import { describe, expect, it } from "vitest";
import type { User } from "../drizzle/schema";
import { assertPlatformSuperAdmin } from "./tenantAccess";

function userWithPlatformRole(platformRole: "platform_user" | "super_admin", role: "user" | "admin" = "user"): User {
  return {
    id: 42,
    openId: `user-${platformRole}-${role}`,
    name: "Usuário de teste",
    email: "usuario@example.com",
    loginMethod: "supabase",
    role,
    platformRole,
    createdAt: new Date("2026-08-26T00:00:00.000Z"),
    updatedAt: new Date("2026-08-26T00:00:00.000Z"),
    lastSignedIn: new Date("2026-08-26T00:00:00.000Z"),
  };
}

describe("assertPlatformSuperAdmin", () => {
  it("bloqueia um usuário comum da plataforma", () => {
    expect(() => assertPlatformSuperAdmin(userWithPlatformRole("platform_user"))).toThrowError(/Apenas o Super Admin/);
  });

  it("não confunde administrador interno de tenant com Super Admin global", () => {
    expect(() => assertPlatformSuperAdmin(userWithPlatformRole("platform_user", "admin"))).toThrowError(/Apenas o Super Admin/);
  });

  it("permite somente o papel global super_admin", () => {
    expect(() => assertPlatformSuperAdmin(userWithPlatformRole("super_admin"))).not.toThrow();
  });
});
