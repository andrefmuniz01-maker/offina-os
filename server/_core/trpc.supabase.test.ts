import { describe, expect, it } from "vitest";
import { router, supabaseAdminProcedure, supabaseProtectedProcedure } from "./trpc";

const testRouter = router({
  protectedRead: supabaseProtectedProcedure.query(() => ({ ok: true })),
  globalRead: supabaseAdminProcedure.query(() => ({ ok: true })),
});

function context(platformRole: "platform_user" | "super_admin" | null) {
  return {
    req: {} as never,
    res: {} as never,
    user: null,
    supabaseUser: platformRole ? {
      id: "f3b9d977-1a0c-407a-b56b-7ca7337d9e88",
      name: "Usuário",
      email: "usuario@empresa.test",
      platformRole,
      accessToken: "teste",
    } : null,
  };
}

describe("procedimentos protegidos Supabase", () => {
  it("nega um procedimento protegido quando não existe identidade Supabase materializada", async () => {
    await expect(testRouter.createCaller(context(null)).protectedRead()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("nega um procedimento global à identidade que não é Super Admin", async () => {
    await expect(testRouter.createCaller(context("platform_user")).globalRead()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("preserva acesso global somente para Super Admin autenticado por Supabase", async () => {
    await expect(testRouter.createCaller(context("super_admin")).globalRead()).resolves.toEqual({ ok: true });
  });
});
