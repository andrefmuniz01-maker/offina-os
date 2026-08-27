import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function contextWithSupabaseAdmin(): TrpcContext {
  return {
    user: null,
    supabaseUser: {
      id: "supabase-admin-id",
      name: "Administrador",
      email: "admin@example.com",
      platformRole: "super_admin",
      accessToken: "never-return-this-token",
    },
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("auth.me", () => {
  it("expõe somente o perfil público e nunca o access token Supabase", async () => {
    const result = await appRouter.createCaller(contextWithSupabaseAdmin()).auth.me();

    expect(result).toEqual({
      id: "supabase-admin-id",
      name: "Administrador",
      email: "admin@example.com",
      platformRole: "super_admin",
    });
    expect(result).not.toHaveProperty("accessToken");
  });
});
