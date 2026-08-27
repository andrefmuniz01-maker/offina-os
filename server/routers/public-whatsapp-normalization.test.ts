import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";
import { normalizePublicWhatsapp } from "./quotes";

describe("normalização de WhatsApp público", () => {
  it("unifica formatos comuns antes de deduplicar ou salvar o contato", () => {
    expect(normalizePublicWhatsapp("(11) 99999-9999")).toBe("11999999999");
    expect(normalizePublicWhatsapp("+55 11 99999-9999")).toBe("5511999999999");
  });

  it("recusa contatos sem uma quantidade válida de dígitos", () => {
    expect(() => normalizePublicWhatsapp("123")).toThrow(TRPCError);
    expect(() => normalizePublicWhatsapp("1234567890123456")).toThrow("Informe um WhatsApp válido com DDD.");
  });
});
