import { z } from "zod";

const quoteStatus = z.enum(["draft", "ready", "sent", "viewed", "approved", "rejected", "expired", "cancelled"]);

const quoteSummarySchema = z.object({
  id: z.number().int().positive(),
  tenantId: z.number().int().positive(),
  number: z.number().int().positive(),
  requestId: z.number().int().positive().nullable(),
  status: quoteStatus,
  subtotal: z.number().nonnegative(),
  discountTotal: z.number().nonnegative(),
  total: z.number().nonnegative(),
  validUntil: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  estimatedCostTotal: z.number().nonnegative().optional(),
  estimatedMarginPercent: z.number().finite().optional(),
}).strict();

const quoteCustomerSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  whatsapp: z.string().min(1),
}).strict();

const quoteVehicleSchema = z.object({
  id: z.number().int().positive(),
  make: z.string().min(1),
  model: z.string().min(1),
  plate: z.string().nullable(),
}).strict();

const quoteItemSchema = z.object({
  id: z.number().int().positive(),
  itemType: z.enum(["service", "product", "kit"]),
  description: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  unitCost: z.number().nonnegative().optional(),
  discount: z.number().nonnegative(),
  sortOrder: z.number().int().nonnegative(),
}).strict();

export const workspaceQuoteListSchema = z.object({
  items: z.array(z.object({ quote: quoteSummarySchema, customer: quoteCustomerSchema, vehicle: quoteVehicleSchema }).strict()),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  hasMore: z.boolean(),
}).strict();

export const workspaceQuoteDetailSchema = z.object({
  quote: quoteSummarySchema.extend({ notes: z.string().nullable(), terms: z.string().nullable() }).strict(),
  customer: quoteCustomerSchema,
  vehicle: quoteVehicleSchema,
  items: z.array(quoteItemSchema),
}).strict();

export function parseWorkspaceQuoteList(value: unknown) {
  return workspaceQuoteListSchema.safeParse(value);
}

export function parseWorkspaceQuoteDetail(value: unknown) {
  return workspaceQuoteDetailSchema.safeParse(value);
}
