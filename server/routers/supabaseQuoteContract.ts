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

export const workspaceQuoteDiscountUpdateSchema = z.object({
  id: z.number().int().positive(),
  tenantId: z.number().int().positive(),
  status: z.literal("draft"),
  subtotal: z.number().nonnegative(),
  discountTotal: z.number().nonnegative(),
  total: z.number().nonnegative(),
  updatedAt: z.string(),
}).strict();

export const workspaceQuoteFinalizeSchema = z.object({
  id: z.number().int().positive(),
  tenantId: z.number().int().positive(),
  requestId: z.number().int().positive(),
  status: z.literal("ready"),
  updatedAt: z.string(),
}).strict();

export const workspaceQuoteManualShareSchema = z.object({
  id: z.number().int().positive(),
  tenantId: z.number().int().positive(),
  requestId: z.number().int().positive(),
  status: z.literal("sent"),
  updatedAt: z.string(),
  publicToken: z.string().length(64),
  messageTemplate: z.string().min(1).max(1600),
  customerName: z.string().min(1),
  vehicleName: z.string().min(1),
  workshopName: z.string().min(1),
  total: z.number().nonnegative(),
}).strict();

export const publicQuoteViewSchema = z.object({
  workshop: z.object({
    name: z.string().min(1),
    branding: z.object({
      primaryColor: z.string().nullable(),
      secondaryColor: z.string().nullable(),
      accentColor: z.string().nullable(),
      publicTitle: z.string().nullable(),
    }).strict(),
  }).strict(),
  customer: z.object({ name: z.string().min(1) }).strict(),
  vehicle: z.object({
    make: z.string().min(1),
    model: z.string().min(1),
    modelYear: z.number().int().nullable(),
  }).strict(),
  quote: z.object({
    number: z.number().int().positive(),
    status: z.literal("viewed"),
    validUntil: z.string(),
    total: z.number().nonnegative(),
    notes: z.string().nullable(),
    terms: z.string().nullable(),
  }).strict(),
  items: z.array(z.object({
    description: z.string().min(1),
    quantity: z.number().positive(),
    unitPrice: z.number().nonnegative(),
    discount: z.number().nonnegative(),
    total: z.number().nonnegative(),
  }).strict()),
}).strict();

export function parseWorkspaceQuoteList(value: unknown) {
  return workspaceQuoteListSchema.safeParse(value);
}

export function parseWorkspaceQuoteDetail(value: unknown) {
  return workspaceQuoteDetailSchema.safeParse(value);
}

export function parseWorkspaceQuoteDiscountUpdate(value: unknown) {
  return workspaceQuoteDiscountUpdateSchema.safeParse(value);
}

export function parseWorkspaceQuoteFinalize(value: unknown) {
  return workspaceQuoteFinalizeSchema.safeParse(value);
}

export function parseWorkspaceQuoteManualShare(value: unknown) {
  return workspaceQuoteManualShareSchema.safeParse(value);
}

export function parsePublicQuoteView(value: unknown) {
  return publicQuoteViewSchema.safeParse(value);
}
