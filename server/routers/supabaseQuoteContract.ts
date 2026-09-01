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
  customerWhatsapp: z.string().min(1),
  vehicleName: z.string().min(1),
  workshopName: z.string().min(1),
  total: z.number().nonnegative(),
}).strict();

export const workspaceGenerateQuoteSchema = z.object({
  id: z.number().int().positive(),
  tenantId: z.number().int().positive(),
  requestId: z.number().int().positive(),
  status: z.literal("ready"),
  updatedAt: z.string(),
  total: z.number().nonnegative(),
}).strict();

export function parseWorkspaceGenerateQuote(value: unknown) {
  return workspaceGenerateQuoteSchema.safeParse(value);
}

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
    status: z.enum(["viewed", "approved", "rejected"]),
    validUntil: z.string(),
    total: z.number().nonnegative(),
    notes: z.string().nullable(),
    terms: z.string().nullable(),
    pdfStorageKey: z.string().nullable(),
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

export const publicQuoteDecisionSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  idempotent: z.boolean(),
}).strict();

export function parsePublicQuoteDecision(value: unknown) {
  return publicQuoteDecisionSchema.safeParse(value);
}

export const workspaceQuoteScheduleSchema = z.object({
  appointmentId: z.number().int().positive(),
  workOrderId: z.number().int().positive(),
  workOrderNumber: z.number().int().positive(),
}).strict();

export function parseWorkspaceQuoteSchedule(value: unknown) {
  return workspaceQuoteScheduleSchema.safeParse(value);
}

const operationStatusSchema = z.enum(["scheduled", "confirmed", "received", "diagnosis", "awaiting_approval", "awaiting_part", "in_service", "completed", "delivered", "cancelled"]);

const workspaceWorkOrderItemSchema = z.object({
  id: z.number().int().positive(),
  description: z.string().min(1),
  itemType: z.enum(["service", "product", "kit"]),
  quantity: z.number().positive(),
}).strict();

const workspaceWorkOrderChecklistSchema = z.object({
  id: z.number().int().positive(),
  label: z.string().min(1),
  completed: z.boolean(),
}).strict();

const workspaceWorkOrderReservationSchema = z.object({
  id: z.number().int().positive(),
  description: z.string().min(1),
  quantity: z.number().positive(),
}).strict();

export const workspaceWorkOrderDetailSchema = z.object({
  order: z.object({
    id: z.number().int().positive(),
    number: z.number().int().positive(),
    status: operationStatusSchema,
    notes: z.string().nullable(),
    assignedToUserId: z.string().uuid().nullable(),
  }).strict(),
  items: z.array(workspaceWorkOrderItemSchema),
  checklist: z.array(workspaceWorkOrderChecklistSchema),
  reservations: z.array(workspaceWorkOrderReservationSchema),
}).strict();

export const workspaceWorkOrderChecklistUpdateSchema = z.object({
  success: z.literal(true),
}).strict();

export const workspaceWorkOrderStatusUpdateSchema = z.object({
  success: z.literal(true),
  status: operationStatusSchema,
}).strict();

export const workspaceWorkOrderReservationConsumptionSchema = z.object({
  success: z.literal(true),
}).strict();

export const workspaceAppointmentListSchema = z.array(z.object({
  appointment: z.object({ id: z.number().int().positive(), status: operationStatusSchema, scheduledStart: z.string().datetime({ offset: true }), scheduledEnd: z.string().datetime({ offset: true }), bay: z.string().nullable(), assignedToUserId: z.string().uuid().nullable(), workOrderId: z.number().int().positive().nullable() }).strict(),
  customer: z.object({ name: z.string() }).strict(),
  vehicle: z.object({ make: z.string(), model: z.string(), plate: z.string().nullable() }).strict(),
  workOrder: z.object({ id: z.number().int().positive(), number: z.number().int().positive(), status: operationStatusSchema }).strict().nullable(),
}).strict());

export const workspaceWorkOrderKanbanSchema = z.array(z.object({
  workOrder: z.object({ id: z.number().int().positive(), number: z.number().int().positive(), status: operationStatusSchema, appointmentId: z.number().int().positive().nullable(), assignedToUserId: z.string().uuid().nullable() }).strict(),
  customer: z.object({ name: z.string() }).strict(),
  vehicle: z.object({ make: z.string(), model: z.string(), plate: z.string().nullable() }).strict(),
  appointment: z.object({ id: z.number().int().positive(), status: operationStatusSchema, scheduledStart: z.string().datetime({ offset: true }), scheduledEnd: z.string().datetime({ offset: true }), bay: z.string().nullable() }).strict().nullable(),
}).strict());

export const workspaceManualAppointmentSchema = z.object({
  appointmentId: z.number().int().positive(),
  workOrderId: z.number().int().positive(),
  workOrderNumber: z.number().int().positive(),
  scheduledEnd: z.string().datetime({ offset: true }),
}).strict();

export const workspaceCalendarAppointmentListSchema = z.array(z.object({
  id: z.number().int().positive(),
  bayId: z.number().int().positive().nullable(),
  bayName: z.string().nullable(),
  status: operationStatusSchema,
  scheduledStart: z.string().datetime({ offset: true }),
  scheduledEnd: z.string().datetime({ offset: true }),
  promisedDeliveryAt: z.string().datetime({ offset: true }).nullable(),
  customerName: z.string(),
  vehicleName: z.string(),
  workOrderId: z.number().int().positive().nullable(),
  notes: z.string().nullable(),
}).strict());

export function parseWorkspaceManualAppointment(value: unknown) { return workspaceManualAppointmentSchema.safeParse(value); }
export function parseWorkspaceCalendarAppointments(value: unknown) { return workspaceCalendarAppointmentListSchema.safeParse(value); }
export function parseWorkspaceAppointmentList(value: unknown) { return workspaceAppointmentListSchema.safeParse(value); }
export function parseWorkspaceWorkOrderKanban(value: unknown) { return workspaceWorkOrderKanbanSchema.safeParse(value); }
export function parseWorkspaceWorkOrderDetail(value: unknown) { return workspaceWorkOrderDetailSchema.safeParse(value); }
export function parseWorkspaceWorkOrderChecklistUpdate(value: unknown) { return workspaceWorkOrderChecklistUpdateSchema.safeParse(value); }
export function parseWorkspaceWorkOrderStatusUpdate(value: unknown) { return workspaceWorkOrderStatusUpdateSchema.safeParse(value); }
export function parseWorkspaceWorkOrderReservationConsumption(value: unknown) { return workspaceWorkOrderReservationConsumptionSchema.safeParse(value); }
