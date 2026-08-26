import { describe, expect, it } from "vitest";
import { buildPrivateAttachmentKey, isAllowedAttachmentMimeType } from "./attachmentStorage";

describe("buildPrivateAttachmentKey", () => {
  it("mantém o escopo de tenant e acrescenta um segmento aleatório não enumerável", () => {
    const first = buildPrivateAttachmentKey({ tenantId: 4, scope: "work-orders", recordId: 81, filename: "foto final.jpg" });
    const second = buildPrivateAttachmentKey({ tenantId: 4, scope: "work-orders", recordId: 81, filename: "foto final.jpg" });

    expect(first.filename).toBe("foto_final.jpg");
    expect(first.key).toMatch(/^tenants\/4\/work-orders\/81\/[A-Za-z0-9_-]{24}-foto_final\.jpg$/);
    expect(second.key).not.toBe(first.key);
  });

  it("normaliza caracteres não permitidos no nome preservado do anexo", () => {
    const stored = buildPrivateAttachmentKey({ tenantId: 5, scope: "quote-requests", recordId: 12, filename: "../vídeo<>.mp4" });

    expect(stored.filename).toBe(".._v_deo__.mp4");
    expect(stored.key).toContain("/quote-requests/12/");
    expect(stored.key).toMatch(/-\.\._v_deo__\.mp4$/);
  });

  it("aceita somente formatos de imagem e vídeo explicitamente permitidos", () => {
    expect(isAllowedAttachmentMimeType(" IMAGE/WEBP ")).toBe(true);
    expect(isAllowedAttachmentMimeType("video/mp4")).toBe(true);
    expect(isAllowedAttachmentMimeType("image/svg+xml")).toBe(false);
    expect(isAllowedAttachmentMimeType("application/pdf")).toBe(false);
  });
});
