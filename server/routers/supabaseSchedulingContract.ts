import { z } from "zod";

const slotSchema = z.object({ start: z.string().datetime({ offset: true }), label: z.string().regex(/^\d{2}:\d{2}$/) }).strict();
const daySchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), slots: z.array(slotSchema).min(1) }).strict();

/** Horários livres por dia (data local da oficina + horários de início). */
export const availableDaysSchema = z.array(daySchema);

const base = {
  workshopName: z.string().min(1),
  quoteNumber: z.number().int().positive(),
  vehicleName: z.string(),
  firstName: z.string(),
};

export const publicSchedulingInfoSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("open"), ...base, durationMinutes: z.number().int().positive(), days: availableDaysSchema }).strict(),
  z.object({ state: z.literal("scheduled"), ...base, scheduledStart: z.string().datetime({ offset: true }), scheduledEnd: z.string().datetime({ offset: true }) }).strict(),
]);

export const publicBookingResultSchema = z.object({
  appointmentId: z.number().int().positive(),
  workOrderNumber: z.number().int().positive(),
  scheduledStart: z.string().datetime({ offset: true }),
  scheduledEnd: z.string().datetime({ offset: true }),
}).strict();

export const workspaceAvailableSlotsSchema = z.object({ durationMinutes: z.number().int().positive(), days: availableDaysSchema }).strict();

export const workspaceSchedulingLinkSchema = z.object({
  quoteNumber: z.number().int().positive(),
  publicToken: z.string().min(32),
  customerName: z.string(),
  customerWhatsapp: z.string(),
  vehicleName: z.string(),
  workshopName: z.string(),
  alreadyScheduled: z.boolean(),
}).strict();

export const workspaceAwaitingScheduleSchema = z.array(z.object({
  quoteId: z.number().int().positive(),
  quoteNumber: z.number().int().positive(),
  total: z.number().nonnegative(),
  approvedAt: z.string().nullable(),
  customerName: z.string(),
  customerWhatsapp: z.string(),
  vehicleName: z.string(),
  workshopName: z.string(),
  publicToken: z.string().min(32),
}).strict());
