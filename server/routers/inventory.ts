import { and, asc, eq, gte, inArray, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  appointments,
  inventoryBalances,
  inventoryMovements,
  inventoryReservations,
  products,
  purchaseOrderItems,
  purchaseOrders,
  quoteItems,
  suppliers,
  workOrderItems,
  workOrders,
} from "../../drizzle/schema";
import { getDb, writeAuditLog } from "../db";
import { getTenantAccess, hasPermission, requireTenantPermission } from "../tenantAccess";
import { protectedProcedure, router } from "../_core/trpc";

const tenantIdInput = z.object({ tenantId: z.number().int().positive() });
const quantityInput = z.coerce.number().finite().positive().max(1_000_000);
const moneyInput = z.coerce.number().finite().nonnegative().max(1_000_000_000);

function availableQuantity(physical: string | number, reserved: string | number) {
  return Number(physical) - Number(reserved);
}

export const inventoryRouter = router({
  list: protectedProcedure.input(tenantIdInput.extend({ search: z.string().trim().max(120).optional() })).query(async ({ ctx, input }) => {
    const access = await requireTenantPermission(ctx.user, input.tenantId, "inventory.manage");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
    const rows = await db.select({ product: products, balance: inventoryBalances }).from(products)
      .innerJoin(inventoryBalances, and(eq(inventoryBalances.tenantId, products.tenantId), eq(inventoryBalances.productId, products.id)))
      .where(eq(products.tenantId, input.tenantId)).orderBy(asc(products.name));
    const financial = hasPermission(access, "financial.view");
    return rows.filter(row => !input.search || row.product.name.toLowerCase().includes(input.search.toLowerCase()) || row.product.sku?.toLowerCase().includes(input.search.toLowerCase())).map(({ product, balance }) => {
      const physical = Number(balance.physicalQuantity);
      const reserved = Number(balance.reservedQuantity);
      return {
        id: product.id, name: product.name, sku: product.sku, unit: product.unit, minStock: Number(product.minStock),
        physicalQuantity: physical, reservedQuantity: reserved, availableQuantity: physical - reserved,
        ...(financial ? { currentCost: Number(product.currentCost), averageCost: Number(product.averageCost), salePrice: Number(product.salePrice) } : {}),
      };
    });
  }),

  movements: protectedProcedure.input(tenantIdInput.extend({ productId: z.number().int().positive(), limit: z.number().int().min(1).max(100).default(50) })).query(async ({ ctx, input }) => {
    await requireTenantPermission(ctx.user, input.tenantId, "inventory.manage");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
    return db.select().from(inventoryMovements).where(and(eq(inventoryMovements.tenantId, input.tenantId), eq(inventoryMovements.productId, input.productId))).orderBy(sql`${inventoryMovements.createdAt} desc`).limit(input.limit);
  }),

  adjust: protectedProcedure.input(tenantIdInput.extend({ productId: z.number().int().positive(), quantityDelta: z.coerce.number().finite().min(-1_000_000).max(1_000_000).refine(value => value !== 0), notes: z.string().trim().min(3).max(1000) })).mutation(async ({ ctx, input }) => {
    await requireTenantPermission(ctx.user, input.tenantId, "inventory.manage");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
    const adjustment = await db.transaction(async (tx) => {
      const row = (await tx.select({ balance: inventoryBalances }).from(inventoryBalances).where(and(eq(inventoryBalances.tenantId, input.tenantId), eq(inventoryBalances.productId, input.productId))).limit(1))[0];
      const previousPhysical = Number(row?.balance.physicalQuantity);
      if (!row || previousPhysical + input.quantityDelta < 0) throw new TRPCError({ code: "BAD_REQUEST", message: "O ajuste não pode tornar o estoque físico negativo." });
      const nextPhysical = previousPhysical + input.quantityDelta;
      await tx.update(inventoryBalances).set({ physicalQuantity: sql`${inventoryBalances.physicalQuantity} + ${input.quantityDelta.toFixed(3)}` }).where(and(eq(inventoryBalances.id, row.balance.id), eq(inventoryBalances.tenantId, input.tenantId)));
      await tx.insert(inventoryMovements).values({ tenantId: input.tenantId, productId: input.productId, type: "adjustment", quantity: Math.abs(input.quantityDelta).toFixed(3), physicalDelta: input.quantityDelta.toFixed(3), reservedDelta: "0", notes: input.notes, createdByUserId: ctx.user.id });
      return { previousPhysical, nextPhysical };
    });
    await writeAuditLog({ tenantId: input.tenantId, actorUserId: ctx.user.id, action: "inventory.adjusted", entityType: "product", entityId: input.productId, before: { physicalQuantity: adjustment.previousPhysical }, after: { physicalQuantity: adjustment.nextPhysical }, metadata: { quantityDelta: input.quantityDelta, notes: input.notes } });
    return { success: true };
  }),

  forecast: protectedProcedure.input(tenantIdInput.extend({ until: z.date().optional() })).query(async ({ ctx, input }) => {
    await requireTenantPermission(ctx.user, input.tenantId, "inventory.manage");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
    const now = new Date();
    const end = input.until ?? new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const balances = await db.select({ product: products, balance: inventoryBalances }).from(products).innerJoin(inventoryBalances, and(eq(inventoryBalances.tenantId, products.tenantId), eq(inventoryBalances.productId, products.id))).where(eq(products.tenantId, input.tenantId));
    const activeReservations = await db.select().from(inventoryReservations).where(and(eq(inventoryReservations.tenantId, input.tenantId), eq(inventoryReservations.status, "active")));
    const upcoming = await db.select({ appointment: appointments, item: quoteItems }).from(appointments)
      .innerJoin(quoteItems, and(eq(quoteItems.tenantId, appointments.tenantId), eq(quoteItems.quoteId, appointments.quoteId)))
      .where(and(eq(appointments.tenantId, input.tenantId), gte(appointments.scheduledStart, now), sql`${appointments.scheduledStart} <= ${end}`, inArray(appointments.status, ["scheduled", "confirmed", "received", "diagnosis", "awaiting_part", "in_service"])));
    const activeWorkOrders = await db.select({ workOrder: workOrders, item: workOrderItems }).from(workOrders)
      .innerJoin(workOrderItems, and(eq(workOrderItems.tenantId, workOrders.tenantId), eq(workOrderItems.workOrderId, workOrders.id)))
      .where(and(eq(workOrders.tenantId, input.tenantId), sql`${workOrders.appointmentId} is null`, inArray(workOrders.status, ["scheduled", "received", "diagnosis", "awaiting_approval", "awaiting_part", "in_service"])));
    const reservedByProduct = new Map<number, number>();
    const reservationCoverageBySource = new Map<string, number>();
    activeReservations.forEach(item => {
      reservedByProduct.set(item.productId, (reservedByProduct.get(item.productId) ?? 0) + Number(item.quantity));
      if (item.quoteId) reservationCoverageBySource.set(`quote:${item.quoteId}:product:${item.productId}`, (reservationCoverageBySource.get(`quote:${item.quoteId}:product:${item.productId}`) ?? 0) + Number(item.quantity));
      if (item.workOrderId) reservationCoverageBySource.set(`work_order:${item.workOrderId}:product:${item.productId}`, (reservationCoverageBySource.get(`work_order:${item.workOrderId}:product:${item.productId}`) ?? 0) + Number(item.quantity));
    });
    const futureNeedByProduct = new Map<number, number>();
    const unreservedFutureNeedByProduct = new Map<number, number>();
    const affectedAppointments = new Map<number, number[]>();
    const affectedWorkOrders = new Map<number, number[]>();
    const addDemand = (productId: number, quantity: number, sourceKey: string | undefined) => {
      futureNeedByProduct.set(productId, (futureNeedByProduct.get(productId) ?? 0) + quantity);
      const covered = sourceKey ? reservationCoverageBySource.get(sourceKey) ?? 0 : 0;
      const uncovered = Math.max(0, quantity - covered);
      if (sourceKey) reservationCoverageBySource.set(sourceKey, Math.max(0, covered - quantity));
      unreservedFutureNeedByProduct.set(productId, (unreservedFutureNeedByProduct.get(productId) ?? 0) + uncovered);
    };
    upcoming.filter(row => row.item.productId !== null).forEach(row => {
      const productId = row.item.productId!;
      addDemand(productId, Number(row.item.quantity), row.appointment.quoteId ? `quote:${row.appointment.quoteId}:product:${productId}` : undefined);
      const rows = affectedAppointments.get(productId) ?? [];
      rows.push(row.appointment.id);
      affectedAppointments.set(productId, rows);
    });
    activeWorkOrders.filter(row => row.item.productId !== null).forEach(row => {
      const productId = row.item.productId!;
      addDemand(productId, Number(row.item.quantity), `work_order:${row.workOrder.id}:product:${productId}`);
      const rows = affectedWorkOrders.get(productId) ?? [];
      rows.push(row.workOrder.id);
      affectedWorkOrders.set(productId, rows);
    });
    return balances.map(({ product, balance }) => {
      const physical = Number(balance.physicalQuantity);
      const reserved = Number(balance.reservedQuantity);
      const available = availableQuantity(physical, reserved);
      const futureNeed = futureNeedByProduct.get(product.id) ?? 0;
      const unreservedFutureNeed = unreservedFutureNeedByProduct.get(product.id) ?? 0;
      const projectedDeficit = Math.max(0, unreservedFutureNeed - available);
      return { productId: product.id, productName: product.name, physical, reserved, available, futureNeed, unreservedFutureNeed, activeReservationDemand: reservedByProduct.get(product.id) ?? 0, projectedDeficit, recommendedPurchaseQuantity: projectedDeficit, affectedAppointmentIds: affectedAppointments.get(product.id) ?? [], affectedWorkOrderIds: affectedWorkOrders.get(product.id) ?? [], critical: available <= Number(product.minStock) || projectedDeficit > 0 };
    }).filter(item => item.critical || item.futureNeed > 0).sort((a, b) => b.projectedDeficit - a.projectedDeficit || a.available - b.available);
  }),

  purchaseOrders: router({
    list: protectedProcedure.input(tenantIdInput.extend({ status: z.enum(["draft", "ordered", "partially_received", "received", "cancelled"]).optional(), page: z.number().int().min(1).default(1), pageSize: z.number().int().min(1).max(100).default(25) })).query(async ({ ctx, input }) => {
      const access = await requireTenantPermission(ctx.user, input.tenantId, "purchases.manage");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
      const filter = input.status ? and(eq(purchaseOrders.tenantId, input.tenantId), eq(purchaseOrders.status, input.status)) : eq(purchaseOrders.tenantId, input.tenantId);
      const rows = await db.select({ order: purchaseOrders, supplier: suppliers }).from(purchaseOrders).leftJoin(suppliers, and(eq(suppliers.id, purchaseOrders.supplierId), eq(suppliers.tenantId, purchaseOrders.tenantId))).where(filter).orderBy(sql`${purchaseOrders.createdAt} desc`).limit(input.pageSize + 1).offset((input.page - 1) * input.pageSize);
      const pageRows = rows.slice(0, input.pageSize);
      const orderIds = pageRows.map(row => row.order.id);
      const items = orderIds.length ? await db.select().from(purchaseOrderItems).where(and(eq(purchaseOrderItems.tenantId, input.tenantId), inArray(purchaseOrderItems.purchaseOrderId, orderIds))) : [];
      const financial = hasPermission(access, "financial.view");
      return { items: pageRows.map(row => {
        const orderItems = items.filter(item => item.purchaseOrderId === row.order.id);
        return { ...row, items: financial ? orderItems : orderItems.map(({ unitCost, ...safe }) => safe) };
      }), page: input.page, pageSize: input.pageSize, hasMore: rows.length > input.pageSize };
    }),
    create: protectedProcedure.input(tenantIdInput.extend({ supplierId: z.number().int().positive().optional(), notes: z.string().max(4000).optional(), items: z.array(z.object({ productId: z.number().int().positive(), quantity: quantityInput, unitCost: moneyInput })).min(1).max(100) })).mutation(async ({ ctx, input }) => {
      const access = await requireTenantPermission(ctx.user, input.tenantId, "purchases.manage");
      if (!hasPermission(access, "financial.manage")) throw new TRPCError({ code: "FORBIDDEN", message: "Seu perfil não pode registrar custos de compra." });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
      if (input.supplierId) {
        const supplier = (await db.select({ id: suppliers.id }).from(suppliers).where(and(eq(suppliers.id, input.supplierId), eq(suppliers.tenantId, input.tenantId))).limit(1))[0];
        if (!supplier) throw new TRPCError({ code: "BAD_REQUEST", message: "O fornecedor não pertence a esta oficina." });
      }
      const productRows = await db.select({ id: products.id }).from(products).where(and(eq(products.tenantId, input.tenantId), inArray(products.id, input.items.map(item => item.productId))));
      if (productRows.length !== input.items.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Um ou mais produtos não pertencem a esta oficina." });
      const result = await db.transaction(async (tx) => {
        const next = (await tx.select({ value: sql<number>`coalesce(max(${purchaseOrders.number}), 0) + 1` }).from(purchaseOrders).where(eq(purchaseOrders.tenantId, input.tenantId)))[0]?.value ?? 1;
        const order = await tx.insert(purchaseOrders).values({ tenantId: input.tenantId, number: Number(next), supplierId: input.supplierId ?? null, notes: input.notes ?? null, createdByUserId: ctx.user.id });
        const orderId = Number(order[0].insertId);
        await tx.insert(purchaseOrderItems).values(input.items.map(item => ({ tenantId: input.tenantId, purchaseOrderId: orderId, productId: item.productId, orderedQuantity: item.quantity.toFixed(3), unitCost: item.unitCost.toFixed(2) })));
        return { id: orderId, number: Number(next) };
      });
      await writeAuditLog({ tenantId: input.tenantId, actorUserId: ctx.user.id, action: "purchase_order.created", entityType: "purchase_order", entityId: result.id, after: { number: result.number } });
      return result;
    }),
    receive: protectedProcedure.input(tenantIdInput.extend({ purchaseOrderId: z.number().int().positive(), items: z.array(z.object({ itemId: z.number().int().positive(), receivedQuantity: quantityInput })).min(1).max(100) })).mutation(async ({ ctx, input }) => {
      const access = await requireTenantPermission(ctx.user, input.tenantId, "purchases.manage");
      if (!hasPermission(access, "financial.manage")) throw new TRPCError({ code: "FORBIDDEN", message: "Seu perfil não pode concluir recebimentos com custo." });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
      const receipt = await db.transaction(async (tx) => {
        const order = (await tx.select().from(purchaseOrders).where(and(eq(purchaseOrders.id, input.purchaseOrderId), eq(purchaseOrders.tenantId, input.tenantId))).limit(1))[0];
        if (!order || order.status === "cancelled" || order.status === "received") throw new TRPCError({ code: "BAD_REQUEST", message: "Pedido indisponível para recebimento." });
        const items = await tx.select().from(purchaseOrderItems).where(and(eq(purchaseOrderItems.tenantId, input.tenantId), eq(purchaseOrderItems.purchaseOrderId, input.purchaseOrderId), inArray(purchaseOrderItems.id, input.items.map(item => item.itemId))));
        if (items.length !== input.items.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Item de compra inválido." });
        const receivedItems: Array<{ itemId: number; productId: number; quantity: number; previousPhysical: number; nextPhysical: number; previousAverageCost: number; nextAverageCost: number; currentCost: string }> = [];
        for (const received of input.items) {
          const item = items.find(value => value.id === received.itemId)!;
          if (Number(item.receivedQuantity) + received.receivedQuantity > Number(item.orderedQuantity)) throw new TRPCError({ code: "BAD_REQUEST", message: "Recebimento supera a quantidade pedida." });
          const balance = (await tx.select().from(inventoryBalances).where(and(eq(inventoryBalances.tenantId, input.tenantId), eq(inventoryBalances.productId, item.productId))).limit(1))[0];
          if (!balance) throw new TRPCError({ code: "BAD_REQUEST", message: "Saldo de estoque não encontrado." });
          const oldQuantity = Number(balance.physicalQuantity);
          const oldAverage = Number((await tx.select({ averageCost: products.averageCost }).from(products).where(and(eq(products.id, item.productId), eq(products.tenantId, input.tenantId))).limit(1))[0]?.averageCost ?? 0);
          const newAverage = (oldQuantity * oldAverage + received.receivedQuantity * Number(item.unitCost)) / (oldQuantity + received.receivedQuantity);
          await tx.update(purchaseOrderItems).set({ receivedQuantity: sql`${purchaseOrderItems.receivedQuantity} + ${received.receivedQuantity.toFixed(3)}` }).where(and(eq(purchaseOrderItems.id, item.id), eq(purchaseOrderItems.tenantId, input.tenantId)));
          await tx.update(inventoryBalances).set({ physicalQuantity: sql`${inventoryBalances.physicalQuantity} + ${received.receivedQuantity.toFixed(3)}` }).where(and(eq(inventoryBalances.id, balance.id), eq(inventoryBalances.tenantId, input.tenantId)));
          await tx.update(products).set({ currentCost: item.unitCost, averageCost: newAverage.toFixed(2) }).where(and(eq(products.id, item.productId), eq(products.tenantId, input.tenantId)));
          await tx.insert(inventoryMovements).values({ tenantId: input.tenantId, productId: item.productId, type: "purchase_entry", quantity: received.receivedQuantity.toFixed(3), physicalDelta: received.receivedQuantity.toFixed(3), reservedDelta: "0", referenceType: "purchase_order", referenceId: input.purchaseOrderId, createdByUserId: ctx.user.id });
          receivedItems.push({ itemId: item.id, productId: item.productId, quantity: received.receivedQuantity, previousPhysical: oldQuantity, nextPhysical: oldQuantity + received.receivedQuantity, previousAverageCost: oldAverage, nextAverageCost: Number(newAverage.toFixed(2)), currentCost: item.unitCost });
        }
        const refreshed = await tx.select().from(purchaseOrderItems).where(and(eq(purchaseOrderItems.tenantId, input.tenantId), eq(purchaseOrderItems.purchaseOrderId, input.purchaseOrderId)));
        const complete = refreshed.every(item => Number(item.receivedQuantity) >= Number(item.orderedQuantity));
        const status = complete ? "received" : "partially_received";
        await tx.update(purchaseOrders).set({ status, receivedAt: complete ? new Date() : null }).where(and(eq(purchaseOrders.id, input.purchaseOrderId), eq(purchaseOrders.tenantId, input.tenantId)));
        return { previousStatus: order.status, status, items: receivedItems };
      });
      await writeAuditLog({ tenantId: input.tenantId, actorUserId: ctx.user.id, action: "purchase_order.received", entityType: "purchase_order", entityId: input.purchaseOrderId, before: { status: receipt.previousStatus }, after: { status: receipt.status, receivedItems: receipt.items } });
      return { success: true };
    }),
  }),
});
