import { describe, expect, it } from "vitest";
import { getAuthCallbackErrorMessage, parseAuthCallbackHash, requiresPasswordSetup, shouldForwardToAuthCallback } from "./authCallbackFlow";

describe("authCallbackFlow", () => {
  it("exige definição de senha para recovery e invite", () => {
    expect(requiresPasswordSetup("recovery")).toBe(true);
    expect(requiresPasswordSetup("invite")).toBe(true);
    expect(requiresPasswordSetup("magiclink")).toBe(false);
    expect(requiresPasswordSetup(null)).toBe(false);
  });

  it("lê tipo e erro do fragmento da URL", () => {
    expect(parseAuthCallbackHash("#access_token=abc&type=recovery")).toEqual({ type: "recovery", errorCode: null, errorDescription: null });
    expect(parseAuthCallbackHash("#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid")).toEqual({ type: null, errorCode: "otp_expired", errorDescription: "Email link is invalid" });
    expect(parseAuthCallbackHash("")).toEqual({ type: null, errorCode: null, errorDescription: null });
  });

  it("encaminha ao callback quando o link cai em outra rota", () => {
    expect(shouldForwardToAuthCallback("/", { type: "recovery", errorCode: null, errorDescription: null })).toBe(true);
    expect(shouldForwardToAuthCallback("/", { type: null, errorCode: "otp_expired", errorDescription: null })).toBe(true);
    expect(shouldForwardToAuthCallback("/", { type: null, errorCode: null, errorDescription: null })).toBe(false);
    expect(shouldForwardToAuthCallback("/auth/callback", { type: "recovery", errorCode: null, errorDescription: null })).toBe(false);
  });

  it("explica o erro do link em linguagem simples", () => {
    expect(getAuthCallbackErrorMessage(null)).toBeNull();
    expect(getAuthCallbackErrorMessage("otp_expired")).toContain("expirou");
    expect(getAuthCallbackErrorMessage("unexpected_failure")).toContain("Não foi possível validar");
  });
});
