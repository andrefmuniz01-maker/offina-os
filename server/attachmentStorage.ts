import { nanoid } from "nanoid";

export function buildPrivateAttachmentKey(input: { tenantId: number; scope: "quote-requests" | "work-orders"; recordId: number; filename: string }) {
  const filename = input.filename.replace(/[^a-zA-Z0-9._-]/g, "_") || "anexo";
  return {
    filename,
    key: `tenants/${input.tenantId}/${input.scope}/${input.recordId}/${nanoid(24)}-${filename}`,
  };
}
