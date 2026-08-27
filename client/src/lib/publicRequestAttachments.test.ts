import { describe, expect, it } from "vitest";
import {
  MAX_PUBLIC_REQUEST_ATTACHMENT_BYTES,
  validatePublicRequestAttachments,
} from "./publicRequestAttachments";

function file(name: string, type: string, size: number) {
  return { name, type, size };
}

describe("validatePublicRequestAttachments", () => {
  it("aceita até cinco anexos permitidos dentro do limite", () => {
    expect(validatePublicRequestAttachments([
      file("motor.jpg", "image/jpeg", MAX_PUBLIC_REQUEST_ATTACHMENT_BYTES),
      file("ruido.webm", "video/webm", 1024),
    ])).toEqual({ ok: true });
  });

  it("rejeita a seleção acima do limite antes de iniciar leitura dos arquivos", () => {
    expect(validatePublicRequestAttachments(Array.from({ length: 6 }, (_, index) => file(`${index}.png`, "image/png", 1024)))).toEqual({
      ok: false,
      message: "Selecione no máximo 5 arquivos para enviar.",
    });
  });

  it("rejeita tipo ou tamanho fora da política pública", () => {
    expect(validatePublicRequestAttachments([file("documento.pdf", "application/pdf", 1024)])).toEqual({
      ok: false,
      message: "Envie apenas fotos JPEG, PNG, WEBP, GIF ou vídeos MP4, WEBM e MOV.",
    });
    expect(validatePublicRequestAttachments([file("video.mov", "video/quicktime", MAX_PUBLIC_REQUEST_ATTACHMENT_BYTES + 1)])).toEqual({
      ok: false,
      message: "Cada arquivo deve ter no máximo 5 MB.",
    });
  });
});
