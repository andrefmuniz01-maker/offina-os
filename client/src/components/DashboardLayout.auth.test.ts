import { describe, expect, it } from "vitest";
import { getPasswordAuthErrorMessage, getPasswordSetupMessage } from "@/lib/passwordAuthMessages";

describe("getPasswordAuthErrorMessage", () => {
  it("explica o limite temporário de envio sem expor detalhes internos", () => {
    expect(
      getPasswordAuthErrorMessage({
        code: "over_email_send_rate_limit",
        message: "email rate limit exceeded",
        status: 429,
      }),
    ).toContain("limite temporário de e-mails");
  });

  it("usa uma resposta neutra quando o Supabase bloqueia OTP", () => {
    expect(
      getPasswordAuthErrorMessage({
        code: "otp_disabled",
        message: "Signups not allowed for otp",
        status: 422,
      }),
    ).toBe("Não foi possível preparar o acesso agora. Verifique as instruções recebidas ou tente novamente mais tarde.");
  });

  it("usa uma mensagem segura para erros não reconhecidos", () => {
    expect(getPasswordAuthErrorMessage({ message: "unexpected" })).toBe(
      "Não foi possível concluir o acesso seguro. Tente novamente mais tarde.",
    );
  });

  it("não expõe detalhes para credenciais inválidas", () => {
    expect(getPasswordAuthErrorMessage({ code: "invalid_credentials" })).toBe("E-mail ou senha incorretos.");
  });

  it("orienta o primeiro acesso sem confirmar se uma identidade está provisionada", () => {
    expect(getPasswordSetupMessage()).toBe("Enviaremos instruções seguras para criar ou redefinir a senha, caso o acesso esteja disponível.");
  });

  it("não revela cadastro, autorização, provisionamento ou inexistência em todo o fluxo de primeiro acesso", () => {
    const firstAccessMessages = [
      getPasswordSetupMessage(),
      getPasswordAuthErrorMessage({ code: "otp_disabled", message: "Signups not allowed for otp", status: 422 }),
      getPasswordAuthErrorMessage({ code: "over_email_send_rate_limit", message: "email rate limit exceeded", status: 429 }),
    ].join(" ").toLowerCase();

    expect(firstAccessMessages).not.toMatch(/cadastr|autoriz|provision|inexist/);
  });
});
