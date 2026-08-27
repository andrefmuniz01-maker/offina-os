export const MAX_PUBLIC_REQUEST_ATTACHMENTS = 5;
export const MAX_PUBLIC_REQUEST_ATTACHMENT_BYTES = 5 * 1024 * 1024;

const allowedAttachmentMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

export type PublicRequestAttachment = Pick<File, "name" | "size" | "type">;

export function validatePublicRequestAttachments(files: PublicRequestAttachment[]) {
  if (files.length > MAX_PUBLIC_REQUEST_ATTACHMENTS) {
    return { ok: false as const, message: "Selecione no máximo 5 arquivos para enviar." };
  }

  for (const file of files) {
    if (!allowedAttachmentMimeTypes.has(file.type.toLowerCase())) {
      return { ok: false as const, message: "Envie apenas fotos JPEG, PNG, WEBP, GIF ou vídeos MP4, WEBM e MOV." };
    }
    if (file.size > MAX_PUBLIC_REQUEST_ATTACHMENT_BYTES) {
      return { ok: false as const, message: "Cada arquivo deve ter no máximo 5 MB." };
    }
  }

  return { ok: true as const };
}
