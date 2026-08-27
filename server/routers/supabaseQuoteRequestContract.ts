import { z } from "zod";

const quoteRequestStatus = z.enum(["new", "in_analysis", "awaiting_information", "in_quoting", "ready", "sent", "approved", "rejected", "expired", "cancelled"]);

const request = z.object({
  id: z.number().int().positive(),
  tenantId: z.number().int().positive(),
  number: z.number().int().positive(),
  customerId: z.number().int().positive().nullable(),
  vehicleId: z.number().int().positive().nullable(),
  serviceId: z.number().int().positive().nullable(),
  requesterName: z.string(),
  requesterWhatsapp: z.string(),
  requesterEmail: z.string().nullable(),
  serviceLabel: z.string(),
  description: z.string().nullable(),
  source: z.string(),
  status: quoteRequestStatus,
  assignedToUserId: z.string().uuid().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const item = z.object({
  request,
  customer: z.object({ id: z.number().int().positive(), name: z.string(), whatsapp: z.string() }).nullable(),
  vehicle: z.object({ id: z.number().int().positive(), make: z.string(), model: z.string(), plate: z.string().nullable() }).nullable(),
  assignedUser: z.object({ id: z.string().uuid(), name: z.string() }).nullable(),
  queueMinutes: z.number().int().nonnegative(),
});

export const workspaceQuoteRequestListSchema = z.object({
  items: z.array(item),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  hasMore: z.boolean(),
});

export const workspaceQuoteRequestHistorySchema = z.array(z.object({
  id: z.number().int().positive(),
  type: z.string(),
  metadata: z.unknown(),
  createdAt: z.string(),
}));

export type WorkspaceQuoteRequestList = z.infer<typeof workspaceQuoteRequestListSchema>;

export function parseWorkspaceQuoteRequestList(value: unknown) {
  return workspaceQuoteRequestListSchema.safeParse(value);
}

export function parseWorkspaceQuoteRequestHistory(value: unknown) {
  return workspaceQuoteRequestHistorySchema.safeParse(value);
}
