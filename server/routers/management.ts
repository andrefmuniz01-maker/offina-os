import { and, desc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  appointments,
  customers,
  expenses,
  inventoryBalances,
  notificationPreferences,
  notifications,
  products,
  quoteRequests,
  quotes,
  revenues,
  vehicles,
  workOrders,
} from "../../drizzle/schema";
import { getDb, writeAuditLog } from "../db";
import { hasPermission, requireTenantPermission } from "../tenantAccess";
import { protectedProcedure, router } from "../_core/trpc";

const tenantIdInput = z.object({ tenantId: z.number().int().positive() });
const moneyInput = z.coerce.number().finite().positive().max(1_000_000_000);
const listPageInput = z.object({ page: z.number().int().min(1).default(1), pageSize: z.number().int().min(1).max(100).default(25) });

export function periodBounds(reference: Date) {
  const start = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), 1));
  const end = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() + 1, 1));
  return { start, end };
}

export const financialRouter = router({
  revenues: router({
    list: protectedProcedure.input(tenantIdInput.extend({ status: z.enum(["expected", "received", "cancelled"]).optional(), page: listPageInput.shape.page, pageSize: listPageInput.shape.pageSize })).query(async ({ ctx, input }) => {
      await requireTenantPermission(ctx.user, input.tenantId, "financial.view");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
      const rows = await db.select().from(revenues).where(input.status ? and(eq(revenues.tenantId, input.tenantId), eq(revenues.status, input.status)) : eq(revenues.tenantId, input.tenantId)).orderBy(desc(revenues.createdAt)).limit(input.pageSize + 1).offset((input.page - 1) * input.pageSize);
      return { items: rows.slice(0, input.pageSize), page: input.page, pageSize: input.pageSize, hasMore: rows.length > input.pageSize };
    }),
    markReceived: protectedProcedure.input(tenantIdInput.extend({ revenueId: z.number().int().positive(), paymentMethod: z.string().trim().min(2).max(64) })).mutation(async ({ ctx, input }) => {
      await requireTenantPermission(ctx.user, input.tenantId, "financial.manage");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
      const result = await db.update(revenues).set({ status: "received", paymentMethod: input.paymentMethod, receivedAt: new Date() }).where(and(eq(revenues.id, input.revenueId), eq(revenues.tenantId, input.tenantId), eq(revenues.status, "expected")));
      if (!result[0].affectedRows) throw new TRPCError({ code: "NOT_FOUND", message: "Receita prevista não encontrada." });
      await writeAuditLog({ tenantId: input.tenantId, actorUserId: ctx.user.id, action: "revenue.received", entityType: "revenue", entityId: input.revenueId, after: { paymentMethod: input.paymentMethod } });
      return { success: true };
    }),
  }),
  expenses: router({
    list: protectedProcedure.input(tenantIdInput.extend({ status: z.enum(["planned", "paid", "cancelled"]).optional(), page: listPageInput.shape.page, pageSize: listPageInput.shape.pageSize })).query(async ({ ctx, input }) => {
      await requireTenantPermission(ctx.user, input.tenantId, "financial.view");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
      const rows = await db.select().from(expenses).where(input.status ? and(eq(expenses.tenantId, input.tenantId), eq(expenses.status, input.status)) : eq(expenses.tenantId, input.tenantId)).orderBy(desc(expenses.expenseDate)).limit(input.pageSize + 1).offset((input.page - 1) * input.pageSize);
      return { items: rows.slice(0, input.pageSize), page: input.page, pageSize: input.pageSize, hasMore: rows.length > input.pageSize };
    }),
    create: protectedProcedure.input(tenantIdInput.extend({ category: z.string().trim().min(2).max(96), amount: moneyInput, expenseDate: z.date(), dueAt: z.date().optional(), recurrence: z.string().trim().max(32).optional(), notes: z.string().max(4000).optional() })).mutation(async ({ ctx, input }) => {
      await requireTenantPermission(ctx.user, input.tenantId, "financial.manage");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
      const result = await db.insert(expenses).values({ tenantId: input.tenantId, category: input.category, amount: input.amount.toFixed(2), expenseDate: input.expenseDate, dueAt: input.dueAt ?? null, recurrence: input.recurrence ?? null, notes: input.notes ?? null, createdByUserId: ctx.user.id });
      const id = Number(result[0].insertId);
      await writeAuditLog({ tenantId: input.tenantId, actorUserId: ctx.user.id, action: "expense.created", entityType: "expense", entityId: id, after: { category: input.category, amount: input.amount } });
      return { id };
    }),
    markPaid: protectedProcedure.input(tenantIdInput.extend({ expenseId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await requireTenantPermission(ctx.user, input.tenantId, "financial.manage");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
      const result = await db.update(expenses).set({ status: "paid" }).where(and(eq(expenses.id, input.expenseId), eq(expenses.tenantId, input.tenantId), eq(expenses.status, "planned")));
      if (!result[0].affectedRows) throw new TRPCError({ code: "NOT_FOUND", message: "Despesa planejada não encontrada nesta oficina." });
      await writeAuditLog({ tenantId: input.tenantId, actorUserId: ctx.user.id, action: "expense.paid", entityType: "expense", entityId: input.expenseId, after: { status: "paid" } });
      return { success: true };
    }),
  }),
});

export const dashboardRouter = router({
  overview: protectedProcedure.input(tenantIdInput.extend({ referenceDate: z.date().optional() })).query(async ({ ctx, input }) => {
    const access = await requireTenantPermission(ctx.user, input.tenantId, "reports.view");
    const canViewFinancials = hasPermission(access, "financial.view");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
    const { start, end } = periodBounds(input.referenceDate ?? new Date());
    const [received, expected, concluded, quoteStats, pendingQuotes, operation, stock] = await Promise.all([
      db.select({ total: sql<string>`coalesce(sum(${revenues.amount}), 0)` }).from(revenues).where(and(eq(revenues.tenantId, input.tenantId), eq(revenues.status, "received"), gte(revenues.receivedAt, start), sql`${revenues.receivedAt} < ${end}`)),
      db.select({ total: sql<string>`coalesce(sum(${revenues.amount}), 0)` }).from(revenues).where(and(eq(revenues.tenantId, input.tenantId), eq(revenues.status, "expected"))),
      db.select({ count: sql<number>`count(*)` }).from(workOrders).where(and(eq(workOrders.tenantId, input.tenantId), eq(workOrders.status, "completed"), gte(workOrders.completedAt, start), sql`${workOrders.completedAt} < ${end}`)),
      db.select({ total: sql<string>`coalesce(sum(${quotes.total}), 0)`, count: sql<number>`count(*)`, approved: sql<number>`sum(case when ${quotes.status} = 'approved' then 1 else 0 end)` }).from(quotes).where(and(eq(quotes.tenantId, input.tenantId), gte(quotes.createdAt, start), sql`${quotes.createdAt} < ${end}`)),
      db.select({ total: sql<string>`coalesce(sum(${quotes.total}), 0)`, count: sql<number>`count(*)` }).from(quotes).where(and(eq(quotes.tenantId, input.tenantId), inArray(quotes.status, ["sent", "viewed", "ready"]))),
      db.select({ scheduled: sql<number>`sum(case when ${appointments.status} in ('scheduled','confirmed') then 1 else 0 end)`, inProgress: sql<number>`sum(case when ${workOrders.status} = 'in_service' then 1 else 0 end)`, yard: sql<number>`sum(case when ${workOrders.status} in ('received','diagnosis','awaiting_approval','awaiting_part','in_service') then 1 else 0 end)` }).from(workOrders).leftJoin(appointments, and(eq(appointments.workOrderId, workOrders.id), eq(appointments.tenantId, workOrders.tenantId))).where(eq(workOrders.tenantId, input.tenantId)),
      db.select({ critical: sql<number>`sum(case when ${inventoryBalances.physicalQuantity} - ${inventoryBalances.reservedQuantity} <= ${products.minStock} then 1 else 0 end)`, reserved: sql<number>`sum(case when ${inventoryBalances.reservedQuantity} > 0 then 1 else 0 end)` }).from(inventoryBalances).innerJoin(products, and(eq(products.id, inventoryBalances.productId), eq(products.tenantId, inventoryBalances.tenantId))).where(eq(inventoryBalances.tenantId, input.tenantId)),
    ]);
    const spent = canViewFinancials ? await db.select({ total: sql<string>`coalesce(sum(${expenses.amount}), 0)` }).from(expenses).where(and(eq(expenses.tenantId, input.tenantId), eq(expenses.status, "paid"), gte(expenses.expenseDate, start), sql`${expenses.expenseDate} < ${end}`)) : [];
    const billing = Number(received[0]?.total ?? 0);
    const expensesTotal = Number(spent[0]?.total ?? 0);
    const completedOrders = Number(concluded[0]?.count ?? 0);
    const quoteCount = Number(quoteStats[0]?.count ?? 0);
    const approvedQuotes = Number(quoteStats[0]?.approved ?? 0);
    return {
      sales: { billing, expectedRevenue: Number(expected[0]?.total ?? 0), averageTicket: completedOrders ? billing / completedOrders : 0, completedOrders, quoteApprovalRate: quoteCount ? approvedQuotes / quoteCount : 0 },
      ...(canViewFinancials ? { finance: { expenses: expensesTotal, estimatedOperationalResult: billing - expensesTotal } } : {}),
      commercial: { pendingQuoteValue: Number(pendingQuotes[0]?.total ?? 0), pendingQuoteCount: Number(pendingQuotes[0]?.count ?? 0) },
      operation: { scheduled: Number(operation[0]?.scheduled ?? 0), inProgress: Number(operation[0]?.inProgress ?? 0), yard: Number(operation[0]?.yard ?? 0) },
      inventory: { critical: Number(stock[0]?.critical ?? 0), reservedProducts: Number(stock[0]?.reserved ?? 0) },
    };
  }),
});

export const notificationRouter = router({
  preferences: protectedProcedure.input(tenantIdInput).query(async ({ ctx, input }) => {
    await requireTenantPermission(ctx.user, input.tenantId, "customers.manage");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
    const preference = (await db.select().from(notificationPreferences).where(and(eq(notificationPreferences.tenantId, input.tenantId), eq(notificationPreferences.userId, ctx.user.id))).limit(1))[0];
    return preference ?? { tenantId: input.tenantId, userId: ctx.user.id, inAppEnabled: true, emailEnabled: false, enabledTypes: [] as string[] };
  }),
  updatePreferences: protectedProcedure.input(tenantIdInput.extend({ inAppEnabled: z.boolean(), enabledTypes: z.array(z.string().trim().min(1).max(64)).max(20) })).mutation(async ({ ctx, input }) => {
    await requireTenantPermission(ctx.user, input.tenantId, "customers.manage");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
    const enabledTypes = Array.from(new Set(input.enabledTypes));
    await db.insert(notificationPreferences).values({ tenantId: input.tenantId, userId: ctx.user.id, inAppEnabled: input.inAppEnabled, emailEnabled: false, enabledTypes }).onDuplicateKeyUpdate({ set: { inAppEnabled: input.inAppEnabled, emailEnabled: false, enabledTypes } });
    await writeAuditLog({ tenantId: input.tenantId, actorUserId: ctx.user.id, action: "notification_preferences.updated", entityType: "notification_preferences", entityId: ctx.user.id, after: { inAppEnabled: input.inAppEnabled, enabledTypes } });
    return { success: true };
  }),
  listMine: protectedProcedure.input(tenantIdInput.extend({ limit: z.number().int().min(1).max(100).default(30) })).query(async ({ ctx, input }) => {
    await requireTenantPermission(ctx.user, input.tenantId, "customers.manage");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
    const preference = (await db.select().from(notificationPreferences).where(and(eq(notificationPreferences.tenantId, input.tenantId), eq(notificationPreferences.userId, ctx.user.id))).limit(1))[0];
    if (preference && !preference.inAppEnabled) return [];
    const enabledTypes = preference?.enabledTypes ?? [];
    return db.select({ notification: notifications, customer: { id: customers.id, name: customers.name, whatsapp: customers.whatsapp }, vehicle: { id: vehicles.id, make: vehicles.make, model: vehicles.model, plate: vehicles.plate } })
      .from(notifications)
      .leftJoin(customers, and(eq(customers.id, notifications.customerId), eq(customers.tenantId, notifications.tenantId)))
      .leftJoin(vehicles, and(eq(vehicles.id, notifications.vehicleId), eq(vehicles.tenantId, notifications.tenantId)))
      .where(and(eq(notifications.tenantId, input.tenantId), or(eq(notifications.userId, ctx.user.id), isNull(notifications.userId)), ...(enabledTypes.length ? [inArray(notifications.type, enabledTypes)] : [])))
      .orderBy(desc(notifications.createdAt)).limit(input.limit);
  }),
  markRead: protectedProcedure.input(tenantIdInput.extend({ notificationId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    await requireTenantPermission(ctx.user, input.tenantId, "customers.manage");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
    await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.id, input.notificationId), eq(notifications.tenantId, input.tenantId), or(eq(notifications.userId, ctx.user.id), isNull(notifications.userId))));
    return { success: true };
  }),
});
