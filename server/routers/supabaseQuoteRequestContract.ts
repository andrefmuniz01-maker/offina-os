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
  assignedUser: z.object({ id: z.string().uuid(), name: z.string().nullable() }).nullable(),
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

const quotePreparationItemSchema = z.object({
  itemType: z.enum(["service", "product"]),
  productId: z.number().int().positive().nullable(),
  serviceId: z.number().int().positive().nullable(),
  description: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  availability: z.enum(["available", "insufficient", "unavailable", "not_applicable"]),
}).strict();

export const workspaceQuotePreparationSchema = z.object({
  request: z.object({
    id: z.number().int().positive(),
    tenantId: z.number().int().positive(),
    number: z.number().int().positive(),
    status: z.literal("in_quoting"),
    serviceLabel: z.string().min(1),
    description: z.string().nullable(),
    createdAt: z.string(),
  }).strict(),
  customer: z.object({
    id: z.number().int().positive(),
    name: z.string().min(1),
    whatsapp: z.string().min(1),
    email: z.string().email().nullable(),
  }).strict(),
  vehicle: z.object({
    id: z.number().int().positive(),
    make: z.string().min(1),
    model: z.string().min(1),
    modelYear: z.number().int().nullable(),
    manufactureYear: z.number().int().nullable(),
    plate: z.string().nullable(),
    mileage: z.number().int().nonnegative().nullable(),
    engine: z.string().nullable(),
    notes: z.string().nullable(),
  }).strict(),
  service: z.object({
    id: z.number().int().positive(),
    name: z.string().min(1),
    description: z.string().nullable(),
    estimatedMinutes: z.number().int().positive(),
    laborPrice: z.number().nonnegative(),
  }).strict(),
  suggestedItems: z.array(quotePreparationItemSchema).min(1),
  subtotal: z.number().nonnegative(),
  total: z.number().nonnegative(),
}).strict();

export const workspaceQuoteDraftSchema = z.object({
  id: z.number().int().positive(),
  tenantId: z.number().int().positive(),
  requestId: z.number().int().positive(),
  number: z.number().int().positive(),
  status: z.literal("draft"),
  validUntil: z.string(),
  total: z.number().nonnegative(),
}).strict();

export type WorkspaceQuoteRequestList = z.infer<typeof workspaceQuoteRequestListSchema>;

export function parseWorkspaceQuoteRequestList(value: unknown) {
  return workspaceQuoteRequestListSchema.safeParse(value);
}

export function parseWorkspaceQuoteRequestHistory(value: unknown) {
  return workspaceQuoteRequestHistorySchema.safeParse(value);
}

export function parseWorkspaceQuotePreparation(value: unknown) {
  return workspaceQuotePreparationSchema.safeParse(value);
}

export function parseWorkspaceQuoteDraft(value: unknown) {
  return workspaceQuoteDraftSchema.safeParse(value);
}
