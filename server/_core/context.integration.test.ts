import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "../../drizzle/schema";

vi.mock("../db", () => ({
  getUserByEmail: vi.fn(),
}));

vi.mock("./supabase", () => ({
  getBearerToken: vi.fn(() => "supabase-token"),
  getSupabaseAuthUser: vi.fn(),
  getSupabaseProfile: vi.fn(),
}));

import * as db from "../db";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { getSupabaseAuthUser, getSupabaseProfile } from "./supabase";

const legacyUser: User = {
  id: 1,
  openId: "legacy-felipe",
  name: "Felipe",
  email: "felipefmuniz@gmail.com",
  loginMethod: "email",
  role: "user",
  platformRole: "platform_user",
  createdAt: new Date("2026-08-26T00:00:00.000Z"),
  updatedAt: new Date("2026-08-26T00:00:00.000Z"),
  lastSignedIn: new Date("2026-08-26T00:00:00.000Z"),
};

function options() {
  return {
    req: { headers: { authorization: "Bearer supabase-token" } },
    res: {},
  } as CreateExpressContextOptions;
}

describe("createContext com Supabase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSupabaseAuthUser).mockResolvedValue({
      id: "c577d57b-6375-431d-8549-971a4b20c0ed",
      email: "felipefmuniz@gmail.com",
    } as Awaited<ReturnType<typeof getSupabaseAuthUser>>);
  });

  it("não materializa contexto quando o token não possui profile autorizado", async () => {
    vi.mocked(getSupabaseProfile).mockResolvedValue(null);

    const context = await createContext(options());

    expect(context.user).toBeNull();
    expect(context.supabaseUser).toBeNull();
    expect(db.getUserByEmail).not.toHaveBeenCalled();
  });

  it("não materializa contexto quando o token não identifica uma sessão Supabase válida", async () => {
    vi.mocked(getSupabaseAuthUser).mockResolvedValue(null);

    const context = await createContext(options());

    expect(context.user).toBeNull();
    expect(context.supabaseUser).toBeNull();
    expect(getSupabaseProfile).not.toHaveBeenCalled();
    expect(db.getUserByEmail).not.toHaveBeenCalled();
  });

  it("não materializa contexto quando o profile diverge da identidade validada pelo token", async () => {
    vi.mocked(getSupabaseProfile).mockResolvedValue({
      id: "outro-id",
      email: "felipefmuniz@gmail.com",
      platformRole: "super_admin",
    });

    const context = await createContext(options());

    expect(context.user).toBeNull();
    expect(context.supabaseUser).toBeNull();
    expect(db.getUserByEmail).not.toHaveBeenCalled();
  });

  it("não materializa contexto nem consulta a ponte legada quando o profile traz papel global inválido", async () => {
    vi.mocked(getSupabaseProfile).mockResolvedValue({
      id: "c577d57b-6375-431d-8549-971a4b20c0ed",
      email: "felipefmuniz@gmail.com",
      platformRole: "finance_admin",
    } as never);

    const context = await createContext(options());

    expect(context.user).toBeNull();
    expect(context.supabaseUser).toBeNull();
    expect(db.getUserByEmail).not.toHaveBeenCalled();
  });

  it("reporta indisponibilidade (nunca 'perfil ausente') quando a consulta ao profile falha por infraestrutura", async () => {
    vi.mocked(getSupabaseProfile).mockRejectedValue(new Error("Falha ao consultar o profile Supabase: canceling statement due to statement timeout"));

    const context = await createContext(options());

    expect(context.supabaseUser).toBeNull();
    expect(context.supabaseAuthUnavailable).toBe(true);
    await expect(appRouter.createCaller(context).auth.me()).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });

  it("preserva a identidade Supabase mesmo sem usuário legado durante a transição", async () => {
    vi.mocked(getSupabaseProfile).mockResolvedValue({
      id: "c577d57b-6375-431d-8549-971a4b20c0ed",
      email: "felipefmuniz@gmail.com",
      platformRole: "super_admin",
    });
    vi.mocked(db.getUserByEmail).mockResolvedValue(undefined);

    const context = await createContext(options());

    expect(context.user).toBeNull();
    expect(context.supabaseUser).toMatchObject({
      id: "c577d57b-6375-431d-8549-971a4b20c0ed",
      email: "felipefmuniz@gmail.com",
      platformRole: "super_admin",
    });
    expect(getSupabaseProfile).toHaveBeenCalledWith("supabase-token", "c577d57b-6375-431d-8549-971a4b20c0ed");
  });

  it("materializa auth.me a partir do contexto Supabase sem expor o token interno", async () => {
    vi.mocked(getSupabaseProfile).mockResolvedValue({
      id: "c577d57b-6375-431d-8549-971a4b20c0ed",
      email: "felipefmuniz@gmail.com",
      platformRole: "super_admin",
    });
    vi.mocked(db.getUserByEmail).mockResolvedValue(undefined);

    const context = await createContext(options());
    const result = await appRouter.createCaller(context).auth.me();

    expect(result).toEqual({
      id: "c577d57b-6375-431d-8549-971a4b20c0ed",
      name: null,
      email: "felipefmuniz@gmail.com",
      platformRole: "super_admin",
    });
    expect(result).not.toHaveProperty("accessToken");
  });

  it("preserva a identidade Supabase quando a ponte MySQL falha durante a transição", async () => {
    vi.mocked(getSupabaseProfile).mockResolvedValue({
      id: "c577d57b-6375-431d-8549-971a4b20c0ed",
      email: "felipefmuniz@gmail.com",
      platformRole: "super_admin",
    });
    vi.mocked(db.getUserByEmail).mockRejectedValue(new Error("MySQL indisponível"));

    const context = await createContext(options());

    expect(context.user).toBeNull();
    expect(context.supabaseUser).toMatchObject({
      id: "c577d57b-6375-431d-8549-971a4b20c0ed",
      email: "felipefmuniz@gmail.com",
      platformRole: "super_admin",
    });
  });

  it("materializa o usuário legado somente após vínculo completo e aplica o papel do profile", async () => {
    vi.mocked(getSupabaseProfile).mockResolvedValue({
      id: "c577d57b-6375-431d-8549-971a4b20c0ed",
      email: "felipefmuniz@gmail.com",
      platformRole: "super_admin",
    });
    vi.mocked(db.getUserByEmail).mockResolvedValue(legacyUser);

    const context = await createContext(options());

    expect(context.user?.id).toBe(legacyUser.id);
    expect(context.user?.platformRole).toBe("super_admin");
    expect(context.supabaseUser?.id).toBe("c577d57b-6375-431d-8549-971a4b20c0ed");
  });
});
