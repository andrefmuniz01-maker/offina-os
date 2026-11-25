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

  it("acrescenta o link da proposta quando o modelo não tem o campo {{link}}", () => {
    const message = renderQuoteMessageTemplate(
      "Olá, {{cliente}}. Preparamos uma sugestão para seu veículo. Consulte o link seguro para revisar e aprovar.",
      { client: "Maria", vehicle: "Corolla", total: "R$ 100,00", link: "https://x.test/orcamento/abc", workshop: "Auto Prime" },
    );
    expect(message).toContain("Olá, Maria.");
    expect(message.endsWith("Veja e aprove sua proposta aqui: https://x.test/orcamento/abc")).toBe(true);
  });

  it("não duplica o link quando o modelo já o inclui", () => {
    const message = renderQuoteMessageTemplate("Proposta: {{link}}", { client: "Maria", vehicle: "Corolla", total: "R$ 1,00", link: "https://x.test/abc", workshop: "Auto Prime" });
    expect(message).toBe("Proposta: https://x.test/abc");
    expect(message.split("https://x.test/abc")).toHaveLength(2);
  });
});

describe("buildWhatsappLink", () => {
  it("monta o link wa.me com o número normalizado e a mensagem codificada", () => {
    const link = buildWhatsappLink("11999998888", "Olá! Total: R$ 10,00");
    expect(link).toBe("https://wa.me/5511999998888?text=Ol%C3%A1!%20Total%3A%20R%24%2010%2C00");
  });
});
