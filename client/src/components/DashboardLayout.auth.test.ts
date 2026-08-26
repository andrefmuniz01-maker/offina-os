import { describe, expect, it } from "vitest";
import { getMagicLinkErrorMessage } from "./DashboardLayout";

describe("getMagicLinkErrorMessage", () => {
  it("explica o limite temporário de envio sem expor detalhes internos", () => {
    expect(
      getMagicLinkErrorMessage({
        code: "over_email_send_rate_limit",
        message: "email rate limit exceeded",
        status: 429,
      }),
    ).toContain("limite temporário de e-mails");
  });

  it("informa que a identidade ainda precisa de autorização quando o Supabase bloqueia OTP", () => {
    expect(
      getMagicLinkErrorMessage({
        code: "otp_disabled",
        message: "Signups not allowed for otp",
        status: 422,
      }),
    ).toContain("ainda não está autorizado");
  });

  it("usa uma mensagem segura para erros não reconhecidos", () => {
    expect(getMagicLinkErrorMessage({ message: "unexpected" })).toBe(
      "Não foi possível iniciar o acesso seguro. Tente novamente mais tarde.",
    );
  });
});
