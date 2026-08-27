import { describe, expect, it } from "vitest";
import { decodePublicAttachment } from "./quotes";

describe("decodePublicAttachment", () => {
  it("aceita base64 válido e confere o MIME declarado no data URL", () => {
    expect(decodePublicAttachment("data:image/jpeg;base64,aGVsbG8=", "image/jpeg").toString()).toBe("hello");
  });

  it("rejeita codificação inválida antes de qualquer persistência", () => {
    expect(() => decodePublicAttachment("###", "image/jpeg")).toThrow(/codificação válida/);
  });

  it("rejeita data URL cujo MIME não corresponde ao tipo de anexo informado", () => {
    expect(() => decodePublicAttachment("data:image/png;base64,aGVsbG8=", "image/jpeg")).toThrow(/não corresponde/);
  });
});
