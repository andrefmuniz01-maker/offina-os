import { describe, expect, it } from "vitest";
import { getPostLoginPath } from "./AuthCallback";

describe("getPostLoginPath", () => {
  it("direciona Super Admin ao painel global", () => {
    expect(getPostLoginPath("super_admin")).toBe("/plataforma");
  });

  it("mantém os demais perfis no início da operação", () => {
    expect(getPostLoginPath("platform_user")).toBe("/");
    expect(getPostLoginPath(null)).toBe("/");
    expect(getPostLoginPath(undefined)).toBe("/");
  });
});
