import { describe, expect, it } from "vitest";
import { getPostLoginPath, isValidPassword } from "./AuthCallback";

describe("getPostLoginPath", () => {
  it("direciona Super Admin ao painel global", () => {
    expect(getPostLoginPath("super_admin")).toBe("/plataforma");
  });

  it("mantém os demais perfis no início da operação", () => {
    expect(getPostLoginPath("platform_user")).toBe("/");
    expect(getPostLoginPath(null)).toBe("/");
    expect(getPostLoginPath(undefined)).toBe("/");
  });

  it("aceita somente senhas que atendem à política configurada", () => {
    expect(isValidPassword("Oficina2026")).toBe(true);
    expect(isValidPassword("curta1A")).toBe(false);
    expect(isValidPassword("somenteletras")).toBe(false);
  });
});
