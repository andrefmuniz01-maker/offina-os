import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { ENV } from "../_core/env";
import { createSupabaseClient, createSupabaseServiceRoleClient } from "../_core/supabase";
import { publicProcedure, router } from "../_core/trpc";

const allowedAttachmentMimes = ["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm", "video/quicktime"] as const;
const attachmentInput = z.object({
  slot: z.number().int().min(1).max(5),
  filename: z.string().trim().min(1).max(180),
  mimeType: z.enum(allowedAttachmentMimes),
  sizeBytes: z.number().int().positive().max(5 * 1024 * 1024),
});

const requestInput = z.object({
  tenantSlug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(96),
  name: z.string().trim().min(2).max(180),
  whatsapp: z.string().trim().min(8).max(32),
  email: z.string().trim().email().max(180).optional(),
  make: z.string().trim().min(1).max(100),
  model: z.string().trim().min(1).max(140),
  modelYear: z.number().int().min(1900).max(2100).optional(),
  plate: z.string().trim().max(16).optional(),
  mileage: z.number().int().nonnegative().optional(),
  serviceId: z.number().int().positive(),
  serviceLabel: z.string().trim().min(2).max(180),
  description: z.string().trim().max(5000).optional(),
  answers: z.record(z.string().max(80), z.union([z.string().max(500), z.number(), z.boolean()])).optional(),
  attachments: z.array(attachmentInput).max(5).default([]),
}).superRefine((value, ctx) => {
  const slots = new Set<number>();
  for (const attachment of value.attachments) {
    if (slots.has(attachment.slot)) ctx.addIssue({ code: "custom", message: "Os anexos possuem posições duplicadas.", path: ["attachments"] });
    slots.add(attachment.slot);
  }
});

function serviceClient() {
  const client = createSupabaseServiceRoleClient();
  if (!client) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "O recebimento de solicitações está temporariamente indisponível." });
  return client;
}

function requestIpFingerprint(request: { socket: { remoteAddress?: string | undefined } }) {
  const address = request.socket.remoteAddress?.trim() || "unknown";
  const secret = ENV.supabaseServiceRoleKey;
  if (!secret) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "O recebimento de solicitações está temporariamente indisponível." });
  return createHash("sha256").update(`${secret}\u0000${address}`).digest("hex");
}

function publicDatabaseError(error: { code?: string | null; message?: string | null } | null) {
  if (error?.code === "P0001") return new TRPCError({ code: "TOO_MANY_REQUESTS", message: error.message ?? "Aguarde alguns minutos antes de enviar novamente." });
  if (error?.code === "22023") return new TRPCError({ code: "BAD_REQUEST", message: error.message ?? "Os dados enviados são inválidos." });
  if (error?.code === "P0002") return new TRPCError({ code: "NOT_FOUND", message: "A oficina ou a capacidade de upload não está disponível." });
  return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível concluir sua solicitação agora." });
}

type PublicCatalog = {
  workshop: { name: string; slug: string; branding?: { logoUrl?: string | null; primaryColor?: string | null; secondaryColor?: string | null; accentColor?: string | null; publicTitle?: string | null } };
  services: Array<{ id: number; name: string; description?: string | null; quoteQuestions?: Array<{ id: string; label: string; required?: boolean; options?: string[] }> | null }>;
};

export const supabasePublicIntakeRouter = router({
  catalog: publicProcedure.input(z.object({ tenantSlug: z.string().trim().toLowerCase().max(96) })).query(async ({ input }) => {
    const { data, error } = await createSupabaseClient().rpc("public_get_workshop_catalog", { target_tenant_slug: input.tenantSlug });
    if (error) throw publicDatabaseError(error);
    return data as PublicCatalog | null;
  }),

  create: publicProcedure.input(requestInput).mutation(async ({ ctx, input }) => {
    const { data, error } = await serviceClient().rpc("internal_submit_public_quote_request", {
      target_tenant_slug: input.tenantSlug,
      requester_name_input: input.name,
      requester_whatsapp_input: input.whatsapp,
      requester_email_input: input.email ?? null,
      vehicle_make_input: input.make,
      vehicle_model_input: input.model,
      vehicle_model_year_input: input.modelYear ?? null,
      vehicle_plate_input: input.plate ?? null,
      vehicle_mileage_input: input.mileage ?? null,
      selected_service_id: input.serviceId ?? null,
      service_label_input: input.serviceLabel,
      description_input: input.description ?? null,
      answers_input: input.answers ?? null,
      attachment_count_input: input.attachments.length,
      source_ip_fingerprint: requestIpFingerprint(ctx.req),
    });
    if (error || !data) throw publicDatabaseError(error);
    return data as { requestNumber: number; uploadCapability: string | null };
  }),

  finalizeAttachments: publicProcedure.input(z.object({
    uploadCapability: z.string().regex(/^[a-f0-9]{64}$/),
    files: z.array(z.object({ slot: z.number().int().min(1).max(5), filename: z.string().trim().min(1).max(180) })).min(1).max(5),
  })).mutation(async ({ input }) => {
    const { data, error } = await serviceClient().rpc("internal_finalize_public_quote_attachments", {
      upload_capability: input.uploadCapability,
      files_input: input.files,
    });
    if (error) throw publicDatabaseError(error);
    return { finalizedCount: Number(data ?? 0) };
  }),
});
