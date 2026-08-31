import { describe, expect, it } from "vitest";
import { buildWhatsappLink, normalizeWhatsappForLink, renderQuoteMessageTemplate } from "./whatsappLink";

describe("normalizeWhatsappForLink", () => {
  it("assume +55 para números de 10 ou 11 dígitos sem DDI", () => {
    expect(normalizeWhatsappForLink("11999998888")).toBe("5511999998888");
    expect(normalizeWhatsappForLink("1133334444")).toBe("551133334444");
  });

  it("mantém o número como está quando já tem DDI (mais de 11 dígitos)", () => {
    expect(normalizeWhatsappForLink("+55 11 99999-8888")).toBe("5511999998888");
  });

  it("remove toda formatação não numérica", () => {
    expect(normalizeWhatsappForLink("(11) 99999-8888")).toBe("5511999998888");
  });
});

describe("renderQuoteMessageTemplate", () => {
  it("substitui todos os placeholders conhecidos", () => {
    const message = renderQuoteMessageTemplate(
      "Olá {{cliente}}, {{veiculo}} está pronto. Total: {{total}}. Link: {{link}}. {{oficina}}",
      { client: "Maria", vehicle: "Corolla", total: "R$ 100,00", link: "https://x.test/abc", workshop: "Auto Prime" },
    );
    expect(message).toBe("Olá Maria, Corolla está pronto. Total: R$ 100,00. Link: https://x.test/abc. Auto Prime");
  });
});

describe("buildWhatsappLink", () => {
  it("monta o link wa.me com o número normalizado e a mensagem codificada", () => {
    const link = buildWhatsappLink("11999998888", "Olá! Total: R$ 10,00");
    expect(link).toBe("https://wa.me/5511999998888?text=Ol%C3%A1!%20Total%3A%20R%24%2010%2C00");
  });
});
