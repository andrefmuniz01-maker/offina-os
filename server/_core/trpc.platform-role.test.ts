import { describe, expect, it, vi } from "vitest";

vi.mock("./notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

import { systemRouter } from "./systemRouter";

function context(platformRole: "platform_user" | "super_admin", legacyRole: "user" | "admin") {
  return {
    req: {} as never,
    res: {} as never,
    user: {
      id: 7,
      openId: "legacy-user",
      role: legacyRole,
      platformRole,
      name: "Usuário",
      email: "usuario@example.com",
      loginMethod: "supabase",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
  };
}

describe("adminProcedure", () => {
  it("uses the global Super Admin role instead of the legacy role field", async () => {
    await expect(
      systemRouter.createCaller(context("platform_user", "admin")).notifyOwner({ title: "Teste", content: "Não deve enviar" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      systemRouter.createCaller(context("super_admin", "user")).notifyOwner({ title: "Teste", content: "Deve enviar" }),
    ).resolves.toEqual({ success: true });
  });
});
