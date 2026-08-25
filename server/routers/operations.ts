import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  attachments,
  appointments,
  customers,
  inventoryBalances,
  inventoryMovements,
  inventoryReservations,
  notifications,
  products,
  quoteItems,
  quotes,
  revenues,
  tenantMembers,
  vehicles,
  workOrderChecklists,
  workOrderConsumption,
  workOrderItems,
  workOrderNotes,
  workOrders,
} from "../../drizzle/schema";
import { getDb, writeAuditLog } from "../db";
import { storagePut } from "../storage";
import { getTenantAccess, hasPermission, requireTenantPermission } from "../tenantAccess";
import { protectedProcedure, router } from "../_core/trpc";

const tenantIdInput = z.object({ tenantId: z.number().int().positive() });
const operationStatus = z.enum(["scheduled", "received", "diagnosis", "awaiting_approval", "awaiting_part", "in_service", "completed", "delivered", "cancelled"]);
const allowedWorkOrderTransitions: Record<z.infer<typeof operationStatus>, z.infer<typeof operationStatus>[]> = {
  scheduled: ["received", "cancelled"],
  received: ["diagnosis", "cancelled"],
  diagnosis: ["awaiting_approval", "awaiting_part", "in_service", "cancelled"],
  awaiting_approval: ["awaiting_part", "in_service", "cancelled"],
  awaiting_part: ["in_service", "cancelled"],
  in_service: ["awaiting_part", "completed"],
  completed: ["delivered"],
  delivered: [],
  cancelled: [],
};

export function isWorkOrderTransitionAllowed(current: z.infer<typeof operationStatus>, next: z.infer<typeof operationStatus>) {
  return current === next || allowedWorkOrderTransitions[current].includes(next);
}

const defaultChecklist = ["Inspeção inicial", "Desmontagem", "Instalação", "Ajuste", "Teste", "Finalização"];

export const appointmentRouter = router({
  scheduleFromQuote: protectedProcedure.input(tenantIdInput.extend({ quoteId: z.number().int().positive(), scheduledStart: z.date(), scheduledEnd: z.date(), assignedToUserId: z.number().int().positive().optional(), bay: z.string().trim().max(80).optional(), notes: z.string().max(4000).optional() })).mutation(async ({ ctx, input }) => {
    await requireTenantPermission(ctx.user, input.tenantId, "appointments.manage");
    if (input.scheduledEnd <= input.scheduledStart) throw new TRPCError({ code: "BAD_REQUEST", message: "O término precisa ser posterior ao início do agendamento." });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
    const quote = (await db.select().from(quotes).where(and(eq(quotes.id, input.quoteId), eq(quotes.tenantId, input.tenantId), eq(quotes.status, "approved"))).limit(1))[0];
    if (!quote) throw new TRPCError({ code: "BAD_REQUEST", message: "Somente um orçamento aprovado pode ser agendado." });
    if (input.assignedToUserId) {
      const assignee = (await db.select({ userId: tenantMembers.userId }).from(tenantMembers).where(and(eq(tenantMembers.tenantId, input.tenantId), eq(tenantMembers.userId, input.assignedToUserId), eq(tenantMembers.active, true))).limit(1))[0];
      if (!assignee) throw new TRPCError({ code: "BAD_REQUEST", message: "O profissional selecionado não pertence a esta oficina ou está inativo." });
    }
    const result = await db.transaction(async (tx) => {
      const existing = (await tx.select({ id: workOrders.id }).from(workOrders).where(and(eq(workOrders.tenantId, input.tenantId), eq(workOrders.quoteId, quote.id))).limit(1))[0];
      const next = (await tx.select({ value: sql<number>`coalesce(max(${workOrders.number}), 0) + 1` }).from(workOrders).where(eq(workOrders.tenantId, input.tenantId)))[0]?.value ?? 1;
      const workOrderId = existing?.id ?? Number((await tx.insert(workOrders).values({ tenantId: input.tenantId, number: Number(next), quoteId: quote.id, customerId: quote.customerId, vehicleId: quote.vehicleId, assignedToUserId: input.assignedToUserId ?? null, estimatedTotal: quote.total, estimatedCostTotal: quote.estimatedCostTotal, notes: input.notes ?? null }))[0].insertId);
      if (!existing) {
        const items = await tx.select().from(quoteItems).where(and(eq(quoteItems.tenantId, input.tenantId), eq(quoteItems.quoteId, quote.id)));
        await tx.insert(workOrderItems).values(items.map(item => ({ tenantId: input.tenantId, workOrderId, productId: item.productId, serviceId: item.serviceId, description: item.description, itemType: item.itemType === "kit" ? "custom" : item.itemType, quantity: item.quantity, unitPrice: item.unitPrice, expectedUnitCost: item.unitCost })));
        await tx.insert(workOrderChecklists).values(defaultChecklist.map((label, sortOrder) => ({ tenantId: input.tenantId, workOrderId, label, sortOrder })));
        await tx.update(inventoryReservations).set({ workOrderId }).where(and(eq(inventoryReservations.tenantId, input.tenantId), eq(inventoryReservations.quoteId, quote.id), eq(inventoryReservations.status, "active")));
      }
      const appointment = await tx.insert(appointments).values({ tenantId: input.tenantId, quoteId: quote.id, customerId: quote.customerId, vehicleId: quote.vehicleId, workOrderId, assignedToUserId: input.assignedToUserId ?? null, bay: input.bay ?? null, scheduledStart: input.scheduledStart, scheduledEnd: input.scheduledEnd, notes: input.notes ?? null });
      const appointmentId = Number(appointment[0].insertId);
      await tx.update(workOrders).set({ appointmentId, assignedToUserId: input.assignedToUserId ?? null }).where(eq(workOrders.id, workOrderId));
      return { appointmentId, workOrderId, workOrderNumber: existing ? undefined : Number(next) };
    });
    await writeAuditLog({ tenantId: input.tenantId, actorUserId: ctx.user.id, action: "appointment.created_from_quote", entityType: "appointment", entityId: result.appointmentId, metadata: { quoteId: input.quoteId, workOrderId: result.workOrderId } });
    return result;
  }),
  list: protectedProcedure.input(tenantIdInput.extend({ from: z.date().optional(), to: z.date().optional() })).query(async ({ ctx, input }) => {
    await requireTenantPermission(ctx.user, input.tenantId, "appointments.manage");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
    return db.select({ appointment: appointments, customer: customers, vehicle: vehicles, workOrder: workOrders }).from(appointments).innerJoin(customers, and(eq(customers.id, appointments.customerId), eq(customers.tenantId, appointments.tenantId))).innerJoin(vehicles, and(eq(vehicles.id, appointments.vehicleId), eq(vehicles.tenantId, appointments.tenantId))).leftJoin(workOrders, and(eq(workOrders.id, appointments.workOrderId), eq(workOrders.tenantId, appointments.tenantId))).where(and(eq(appointments.tenantId, input.tenantId), ...(input.from ? [gte(appointments.scheduledStart, input.from)] : []), ...(input.to ? [sql`${appointments.scheduledStart} <= ${input.to}`] : []))).orderBy(asc(appointments.scheduledStart));
  }),
});

export const workOrderRouter = router({
  kanban: protectedProcedure.input(tenantIdInput).query(async ({ ctx, input }) => {
    const access = await getTenantAccess(ctx.user, input.tenantId);
    if (!hasPermission(access, "work_orders.manage") && !hasPermission(access, "work_orders.execute")) throw new TRPCError({ code: "FORBIDDEN", message: "Seu perfil não pode visualizar o pátio." });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
    const ownOnly = access.membership?.role === "technician";
    const rows = await db.select({ workOrder: workOrders, vehicle: vehicles, customer: customers, appointment: appointments }).from(workOrders).innerJoin(vehicles, and(eq(vehicles.id, workOrders.vehicleId), eq(vehicles.tenantId, workOrders.tenantId))).innerJoin(customers, and(eq(customers.id, workOrders.customerId), eq(customers.tenantId, workOrders.tenantId))).leftJoin(appointments, and(eq(appointments.id, workOrders.appointmentId), eq(appointments.tenantId, workOrders.tenantId))).where(and(eq(workOrders.tenantId, input.tenantId), ...(ownOnly ? [eq(workOrders.assignedToUserId, ctx.user.id)] : []), inArray(workOrders.status, ["scheduled", "received", "diagnosis", "awaiting_approval", "awaiting_part", "in_service", "completed"])));
    return rows;
  }),
  detail: protectedProcedure.input(tenantIdInput.extend({ workOrderId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const access = await getTenantAccess(ctx.user, input.tenantId);
    if (!hasPermission(access, "work_orders.manage") && !hasPermission(access, "work_orders.execute")) throw new TRPCError({ code: "FORBIDDEN", message: "Seu perfil não pode acessar a ordem de serviço." });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
    const order = (await db.select().from(workOrders).where(and(eq(workOrders.id, input.workOrderId), eq(workOrders.tenantId, input.tenantId))).limit(1))[0];
    if (!order || (access.membership?.role === "technician" && order.assignedToUserId !== ctx.user.id)) throw new TRPCError({ code: "FORBIDDEN", message: "Ordem de serviço indisponível para o seu perfil." });
    const [items, checklist, consumption, reservations, executionAttachments, notes] = await Promise.all([
      db.select().from(workOrderItems).where(and(eq(workOrderItems.tenantId, input.tenantId), eq(workOrderItems.workOrderId, input.workOrderId))),
      db.select().from(workOrderChecklists).where(and(eq(workOrderChecklists.tenantId, input.tenantId), eq(workOrderChecklists.workOrderId, input.workOrderId))).orderBy(asc(workOrderChecklists.sortOrder)),
      db.select().from(workOrderConsumption).where(and(eq(workOrderConsumption.tenantId, input.tenantId), eq(workOrderConsumption.workOrderId, input.workOrderId))),
      db.select().from(inventoryReservations).where(and(eq(inventoryReservations.tenantId, input.tenantId), eq(inventoryReservations.workOrderId, input.workOrderId), eq(inventoryReservations.status, "active"))),
      db.select().from(attachments).where(and(eq(attachments.tenantId, input.tenantId), eq(attachments.workOrderId, input.workOrderId))),
      db.select().from(workOrderNotes).where(and(eq(workOrderNotes.tenantId, input.tenantId), eq(workOrderNotes.workOrderId, input.workOrderId))).orderBy(desc(workOrderNotes.createdAt)),
    ]);
    const visibleFinancial = hasPermission(access, "financial.view");
    return { order: visibleFinancial ? order : (({ estimatedCostTotal, realCostTotal, realMarginPercent, ...safe }) => safe)(order), items: visibleFinancial ? items : items.map(({ expectedUnitCost, ...safe }) => safe), checklist, consumption: visibleFinancial ? consumption : consumption.map(({ unitCost, ...safe }) => safe), reservations, executionAttachments, notes };
  }),
  updateStatus: protectedProcedure.input(tenantIdInput.extend({ workOrderId: z.number().int().positive(), status: operationStatus, notes: z.string().max(4000).optional() })).mutation(async ({ ctx, input }) => {
    const access = await getTenantAccess(ctx.user, input.tenantId);
    if (!hasPermission(access, "work_orders.manage") && !hasPermission(access, "work_orders.execute")) throw new TRPCError({ code: "FORBIDDEN", message: "Seu perfil não pode atualizar a OS." });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
    const order = (await db.select().from(workOrders).where(and(eq(workOrders.id, input.workOrderId), eq(workOrders.tenantId, input.tenantId))).limit(1))[0];
    if (!order || (access.membership?.role === "technician" && order.assignedToUserId !== ctx.user.id)) throw new TRPCError({ code: "FORBIDDEN", message: "Ordem de serviço indisponível para o seu perfil." });
    if (!isWorkOrderTransitionAllowed(order.status, input.status)) throw new TRPCError({ code: "BAD_REQUEST", message: `Não é permitido mudar a OS de ${order.status} para ${input.status}.` });
    if (input.status === "completed") {
      const uncompleted = await db.select({ id: workOrderChecklists.id }).from(workOrderChecklists).where(and(eq(workOrderChecklists.tenantId, input.tenantId), eq(workOrderChecklists.workOrderId, input.workOrderId), eq(workOrderChecklists.completed, false))).limit(1);
      if (uncompleted.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Conclua o checklist antes de finalizar a OS." });
    }
    await db.transaction(async (tx) => {
      await tx.update(workOrders).set({ status: input.status, notes: input.notes ?? order.notes, completedAt: input.status === "completed" ? new Date() : order.completedAt, deliveredAt: input.status === "delivered" ? new Date() : order.deliveredAt }).where(and(eq(workOrders.id, input.workOrderId), eq(workOrders.tenantId, input.tenantId)));
      if (order.appointmentId) await tx.update(appointments).set({ status: input.status }).where(and(eq(appointments.id, order.appointmentId), eq(appointments.tenantId, input.tenantId)));
      if (input.status === "completed") {
        const existingRevenue = (await tx.select({ id: revenues.id }).from(revenues).where(and(eq(revenues.tenantId, input.tenantId), eq(revenues.workOrderId, input.workOrderId))).limit(1))[0];
        if (!existingRevenue) await tx.insert(revenues).values({ tenantId: input.tenantId, workOrderId: input.workOrderId, customerId: order.customerId, vehicleId: order.vehicleId, amount: order.estimatedTotal, status: "expected", dueAt: new Date(), notes: `Receita prevista pela OS #${order.number}` });
      }
      if (input.status === "delivered" && order.status !== "delivered") {
        await tx.insert(notifications).values({ tenantId: input.tenantId, customerId: order.customerId, vehicleId: order.vehicleId, workOrderId: input.workOrderId, type: "post_sale_suggested", title: `Pós-venda sugerido para OS #${order.number}`, body: "O veículo foi entregue. Prepare um contato de acompanhamento quando fizer sentido para o cliente.", link: `/os/${input.workOrderId}` });
      }
      if (["delivered", "cancelled"].includes(input.status) && order.status !== input.status) {
        const activeReservations = await tx.select().from(inventoryReservations).where(and(eq(inventoryReservations.tenantId, input.tenantId), eq(inventoryReservations.workOrderId, input.workOrderId), eq(inventoryReservations.status, "active")));
        for (const reservation of activeReservations) {
          const balance = (await tx.select().from(inventoryBalances).where(and(eq(inventoryBalances.tenantId, input.tenantId), eq(inventoryBalances.productId, reservation.productId))).limit(1))[0];
          if (!balance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Saldo de estoque não encontrado para liberar a reserva." });
          await tx.update(inventoryReservations).set({ status: "released", releasedAt: new Date() }).where(and(eq(inventoryReservations.id, reservation.id), eq(inventoryReservations.tenantId, input.tenantId)));
          await tx.update(inventoryBalances).set({ reservedQuantity: sql`greatest(${inventoryBalances.reservedQuantity} - ${reservation.quantity}, 0)` }).where(and(eq(inventoryBalances.id, balance.id), eq(inventoryBalances.tenantId, input.tenantId)));
          await tx.insert(inventoryMovements).values({ tenantId: input.tenantId, productId: reservation.productId, type: "reservation_release", quantity: reservation.quantity, physicalDelta: "0", reservedDelta: sql`-${reservation.quantity}`, referenceType: "work_order", referenceId: input.workOrderId, createdByUserId: ctx.user.id, notes: "Reserva liberada no encerramento da ordem de serviço." });
        }
      }
    });
    await writeAuditLog({ tenantId: input.tenantId, actorUserId: ctx.user.id, action: "work_order.status_updated", entityType: "work_order", entityId: input.workOrderId, after: { status: input.status } });
    return { success: true };
  }),
  toggleChecklist: protectedProcedure.input(tenantIdInput.extend({ checklistId: z.number().int().positive(), completed: z.boolean() })).mutation(async ({ ctx, input }) => {
    const access = await getTenantAccess(ctx.user, input.tenantId);
    if (!hasPermission(access, "work_orders.manage") && !hasPermission(access, "work_orders.execute")) throw new TRPCError({ code: "FORBIDDEN", message: "Seu perfil não pode atualizar o checklist." });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
    const row = (await db.select({ checklist: workOrderChecklists, order: workOrders }).from(workOrderChecklists).innerJoin(workOrders, and(eq(workOrders.id, workOrderChecklists.workOrderId), eq(workOrders.tenantId, workOrderChecklists.tenantId))).where(and(eq(workOrderChecklists.id, input.checklistId), eq(workOrderChecklists.tenantId, input.tenantId))).limit(1))[0];
    if (!row || (access.membership?.role === "technician" && row.order.assignedToUserId !== ctx.user.id)) throw new TRPCError({ code: "FORBIDDEN", message: "Checklist indisponível para o seu perfil." });
    await db.update(workOrderChecklists).set({ completed: input.completed, completedByUserId: input.completed ? ctx.user.id : null, completedAt: input.completed ? new Date() : null }).where(eq(workOrderChecklists.id, input.checklistId));
    await writeAuditLog({ tenantId: input.tenantId, actorUserId: ctx.user.id, action: "work_order.checklist_updated", entityType: "work_order_checklist", entityId: input.checklistId, before: { completed: row.checklist.completed }, after: { completed: input.completed, workOrderId: row.order.id } });
    return { success: true };
  }),
  uploadExecutionAttachment: protectedProcedure.input(tenantIdInput.extend({ workOrderId: z.number().int().positive(), filename: z.string().trim().min(1).max(180), mimeType: z.string().trim().regex(/^(image|video)\//), base64: z.string().min(8).max(7_000_000) })).mutation(async ({ ctx, input }) => {
    const access = await getTenantAccess(ctx.user, input.tenantId);
    if (!hasPermission(access, "work_orders.manage") && !hasPermission(access, "work_orders.execute")) throw new TRPCError({ code: "FORBIDDEN", message: "Seu perfil não pode adicionar fotos à OS." });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
    const order = (await db.select().from(workOrders).where(and(eq(workOrders.id, input.workOrderId), eq(workOrders.tenantId, input.tenantId))).limit(1))[0];
    if (!order || (access.membership?.role === "technician" && order.assignedToUserId !== ctx.user.id)) throw new TRPCError({ code: "FORBIDDEN", message: "OS indisponível para o seu perfil." });
    const base64 = input.base64.includes(",") ? input.base64.split(",").at(-1)! : input.base64;
    const bytes = Buffer.from(base64, "base64");
    if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw new TRPCError({ code: "BAD_REQUEST", message: "O anexo precisa ter até 5 MB." });
    const stored = await storagePut(`tenants/${input.tenantId}/work-orders/${input.workOrderId}/${input.filename}`, bytes, input.mimeType);
    const result = await db.insert(attachments).values({ tenantId: input.tenantId, workOrderId: input.workOrderId, storageKey: stored.key, url: stored.url, filename: input.filename, mimeType: input.mimeType, sizeBytes: bytes.length, createdByUserId: ctx.user.id });
    const id = Number(result[0].insertId);
    await writeAuditLog({ tenantId: input.tenantId, actorUserId: ctx.user.id, action: "work_order.execution_attachment_added", entityType: "attachment", entityId: id, metadata: { workOrderId: input.workOrderId, mimeType: input.mimeType } });
    return { id, url: stored.url };
  }),
  addNote: protectedProcedure.input(tenantIdInput.extend({ workOrderId: z.number().int().positive(), body: z.string().trim().min(1).max(4000) })).mutation(async ({ ctx, input }) => {
    const access = await getTenantAccess(ctx.user, input.tenantId);
    if (!hasPermission(access, "work_orders.manage") && !hasPermission(access, "work_orders.execute")) throw new TRPCError({ code: "FORBIDDEN", message: "Seu perfil não pode adicionar apontamentos à OS." });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
    const order = (await db.select().from(workOrders).where(and(eq(workOrders.id, input.workOrderId), eq(workOrders.tenantId, input.tenantId))).limit(1))[0];
    if (!order || (access.membership?.role === "technician" && order.assignedToUserId !== ctx.user.id)) throw new TRPCError({ code: "FORBIDDEN", message: "OS indisponível para o seu perfil." });
    const result = await db.insert(workOrderNotes).values({ tenantId: input.tenantId, workOrderId: input.workOrderId, authorUserId: ctx.user.id, body: input.body });
    const id = Number(result[0].insertId);
    await writeAuditLog({ tenantId: input.tenantId, actorUserId: ctx.user.id, action: "work_order.note_added", entityType: "work_order_note", entityId: id, metadata: { workOrderId: input.workOrderId } });
    return { id };
  }),
  consumeProduct: protectedProcedure.input(tenantIdInput.extend({ workOrderId: z.number().int().positive(), productId: z.number().int().positive(), quantity: z.coerce.number().positive(), reservationId: z.number().int().positive().optional() })).mutation(async ({ ctx, input }) => {
    const access = await getTenantAccess(ctx.user, input.tenantId);
    if (!hasPermission(access, "work_orders.manage") && !hasPermission(access, "work_orders.execute")) throw new TRPCError({ code: "FORBIDDEN", message: "Seu perfil não pode registrar consumo." });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
    await db.transaction(async (tx) => {
      const order = (await tx.select().from(workOrders).where(and(eq(workOrders.id, input.workOrderId), eq(workOrders.tenantId, input.tenantId))).limit(1))[0];
      if (!order || (access.membership?.role === "technician" && order.assignedToUserId !== ctx.user.id)) throw new TRPCError({ code: "FORBIDDEN", message: "OS indisponível para o seu perfil." });
      const balance = (await tx.select().from(inventoryBalances).where(and(eq(inventoryBalances.tenantId, input.tenantId), eq(inventoryBalances.productId, input.productId))).limit(1))[0];
      const product = (await tx.select().from(products).where(and(eq(products.id, input.productId), eq(products.tenantId, input.tenantId))).limit(1))[0];
      if (!balance || !product || Number(balance.physicalQuantity) < input.quantity) throw new TRPCError({ code: "CONFLICT", message: "Estoque físico insuficiente para registrar este consumo." });
      let reservedDelta = 0;
      if (input.reservationId) {
        const reservation = (await tx.select().from(inventoryReservations).where(and(eq(inventoryReservations.id, input.reservationId), eq(inventoryReservations.tenantId, input.tenantId), eq(inventoryReservations.workOrderId, input.workOrderId), eq(inventoryReservations.productId, input.productId), eq(inventoryReservations.status, "active"))).limit(1))[0];
        if (!reservation || Number(reservation.quantity) < input.quantity) throw new TRPCError({ code: "BAD_REQUEST", message: "A reserva indicada não cobre este consumo." });
        reservedDelta = input.quantity;
        const remaining = Number(reservation.quantity) - input.quantity;
        await tx.update(inventoryReservations).set({ quantity: remaining.toFixed(3), status: remaining === 0 ? "consumed" : "active", releasedAt: remaining === 0 ? new Date() : null }).where(eq(inventoryReservations.id, reservation.id));
      }
      await tx.update(inventoryBalances).set({ physicalQuantity: sql`${inventoryBalances.physicalQuantity} - ${input.quantity.toFixed(3)}`, reservedQuantity: reservedDelta ? sql`${inventoryBalances.reservedQuantity} - ${reservedDelta.toFixed(3)}` : balance.reservedQuantity }).where(eq(inventoryBalances.id, balance.id));
      await tx.insert(workOrderConsumption).values({ tenantId: input.tenantId, workOrderId: input.workOrderId, productId: input.productId, reservationId: input.reservationId ?? null, quantity: input.quantity.toFixed(3), unitCost: product.currentCost, consumedByUserId: ctx.user.id });
      await tx.insert(inventoryMovements).values({ tenantId: input.tenantId, productId: input.productId, type: "consumption", quantity: input.quantity.toFixed(3), physicalDelta: (-input.quantity).toFixed(3), reservedDelta: (-reservedDelta).toFixed(3), referenceType: "work_order", referenceId: input.workOrderId, createdByUserId: ctx.user.id });
      const aggregate = (await tx.select({ cost: sql<string>`coalesce(sum(${workOrderConsumption.quantity} * ${workOrderConsumption.unitCost}), 0)` }).from(workOrderConsumption).where(and(eq(workOrderConsumption.tenantId, input.tenantId), eq(workOrderConsumption.workOrderId, input.workOrderId))))[0];
      const realCost = Number(aggregate?.cost ?? 0);
      const margin = Number(order.estimatedTotal) > 0 ? ((Number(order.estimatedTotal) - realCost) / Number(order.estimatedTotal)) * 100 : 0;
      await tx.update(workOrders).set({ realCostTotal: realCost.toFixed(2), realMarginPercent: margin.toFixed(2) }).where(eq(workOrders.id, input.workOrderId));
    });
    await writeAuditLog({ tenantId: input.tenantId, actorUserId: ctx.user.id, action: "work_order.product_consumed", entityType: "work_order", entityId: input.workOrderId, metadata: { productId: input.productId, quantity: input.quantity } });
    return { success: true };
  }),
});
