import { renderToStaticMarkup } from "react-dom/server";
import React, { createElement } from "react";
import { describe, expect, it } from "vitest";
import { requiresPasswordSetup } from "@/lib/authCallbackFlow";
import { AuthPasswordSetupForm } from "@/components/AuthPasswordSetupForm";
import { getMeQueryOutcomeMessage, getPostLoginPath, isValidPassword } from "./AuthCallback";

describe("getMeQueryOutcomeMessage", () => {
  it("relata falha de verificação (não 'perfil ausente') quando a consulta ao servidor falhou", () => {
    expect(getMeQueryOutcomeMessage(true, false)).toBe("Não foi possível verificar sua sessão agora. Recarregue a página em instantes.");
    expect(getMeQueryOutcomeMessage(true, true)).toBe("Não foi possível verificar sua sessão agora. Recarregue a página em instantes.");
  });

  it("relata perfil ausente somente quando a consulta teve sucesso e não retornou dados", () => {
    expect(getMeQueryOutcomeMessage(false, false)).toBe("Seu link foi validado, mas seu perfil operacional ainda não está disponível. Contate um Super Admin.");
  });

  it("não relata nenhum problema quando a consulta teve sucesso e retornou o perfil", () => {
    expect(getMeQueryOutcomeMessage(false, true)).toBeNull();
  });
});

describe("getPostLoginPath", () => {
  it("direciona Super Admin à Home Supabase enquanto o painel global é migrado", () => {
    expect(getPostLoginPath("super_admin")).toBe("/");
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

  it("exige definição de senha tanto para recuperação quanto para convite", () => {
    expect(requiresPasswordSetup("recovery")).toBe(true);
    expect(requiresPasswordSetup("invite")).toBe(true);
    expect(requiresPasswordSetup("signup")).toBe(false);
    expect(requiresPasswordSetup(null)).toBe(false);
  });

  it("renderiza a tela de definição de senha usada pelo callback de convite", () => {
    const markup = renderToStaticMarkup(createElement(AuthPasswordSetupForm, {
      newPassword: "",
      confirmPassword: "",
      passwordError: null,
      isSavingPassword: false,
      onSubmit: () => undefined,
      onNewPasswordChange: () => undefined,
      onConfirmPasswordChange: () => undefined,
    }));

    expect(markup).toContain("Defina sua senha");
    expect(markup).toContain('aria-label="Nova senha"');
    expect(markup).toContain('aria-label="Confirmar nova senha"');
    expect(markup).toContain("Salvar senha e continuar");
  });
});
