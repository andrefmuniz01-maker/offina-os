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
    await db.transaction(async (tx) => {
      const row = (await tx.select({ balance: inventoryBalances }).from(inventoryBalances).where(and(eq(inventoryBalances.tenantId, input.tenantId), eq(inventoryBalances.productId, input.productId))).limit(1))[0];
      if (!row || Number(row.balance.physicalQuantity) + input.quantityDelta < 0) throw new TRPCError({ code: "BAD_REQUEST", message: "O ajuste não pode tornar o estoque físico negativo." });
      await tx.update(inventoryBalances).set({ physicalQuantity: sql`${inventoryBalances.physicalQuantity} + ${input.quantityDelta.toFixed(3)}` }).where(eq(inventoryBalances.id, row.balance.id));
      await tx.insert(inventoryMovements).values({ tenantId: input.tenantId, productId: input.productId, type: "adjustment", quantity: Math.abs(input.quantityDelta).toFixed(3), physicalDelta: input.quantityDelta.toFixed(3), reservedDelta: "0", notes: input.notes, createdByUserId: ctx.user.id });
    });
    await writeAuditLog({ tenantId: input.tenantId, actorUserId: ctx.user.id, action: "inventory.adjusted", entityType: "product", entityId: input.productId, metadata: { quantityDelta: input.quantityDelta, notes: input.notes } });
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
    const reservedByProduct = new Map<number, number>();
    activeReservations.forEach(item => reservedByProduct.set(item.productId, (reservedByProduct.get(item.productId) ?? 0) + Number(item.quantity)));
    const futureNeedByProduct = new Map<number, number>();
    const affectedAppointments = new Map<number, number[]>();
    upcoming.filter(row => row.item.productId !== null).forEach(row => {
      const productId = row.item.productId!;
      futureNeedByProduct.set(productId, (futureNeedByProduct.get(productId) ?? 0) + Number(row.item.quantity));
      const rows = affectedAppointments.get(productId) ?? [];
      rows.push(row.appointment.id);
      affectedAppointments.set(productId, rows);
    });
    return balances.map(({ product, balance }) => {
      const physical = Number(balance.physicalQuantity);
      const reserved = Number(balance.reservedQuantity);
      const available = availableQuantity(physical, reserved);
      const futureNeed = futureNeedByProduct.get(product.id) ?? 0;
      const projectedDeficit = Math.max(0, futureNeed - available);
      return { productId: product.id, productName: product.name, physical, reserved, available, futureNeed, activeReservationDemand: reservedByProduct.get(product.id) ?? 0, projectedDeficit, recommendedPurchaseQuantity: projectedDeficit, affectedAppointmentIds: affectedAppointments.get(product.id) ?? [], critical: available <= Number(product.minStock) || projectedDeficit > 0 };
    }).filter(item => item.critical || item.futureNeed > 0).sort((a, b) => b.projectedDeficit - a.projectedDeficit || a.available - b.available);
  }),

  purchaseOrders: router({
    list: protectedProcedure.input(tenantIdInput).query(async ({ ctx, input }) => {
      await requireTenantPermission(ctx.user, input.tenantId, "purchases.manage");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
      const rows = await db.select({ order: purchaseOrders, supplier: suppliers }).from(purchaseOrders).leftJoin(suppliers, and(eq(suppliers.id, purchaseOrders.supplierId), eq(suppliers.tenantId, purchaseOrders.tenantId))).where(eq(purchaseOrders.tenantId, input.tenantId)).orderBy(sql`${purchaseOrders.createdAt} desc`);
      const orderIds = rows.map(row => row.order.id);
      const items = orderIds.length ? await db.select().from(purchaseOrderItems).where(and(eq(purchaseOrderItems.tenantId, input.tenantId), inArray(purchaseOrderItems.purchaseOrderId, orderIds))) : [];
      return rows.map(row => ({ ...row, items: items.filter(item => item.purchaseOrderId === row.order.id) }));
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
      await db.transaction(async (tx) => {
        const order = (await tx.select().from(purchaseOrders).where(and(eq(purchaseOrders.id, input.purchaseOrderId), eq(purchaseOrders.tenantId, input.tenantId))).limit(1))[0];
        if (!order || order.status === "cancelled" || order.status === "received") throw new TRPCError({ code: "BAD_REQUEST", message: "Pedido indisponível para recebimento." });
        const items = await tx.select().from(purchaseOrderItems).where(and(eq(purchaseOrderItems.tenantId, input.tenantId), eq(purchaseOrderItems.purchaseOrderId, input.purchaseOrderId), inArray(purchaseOrderItems.id, input.items.map(item => item.itemId))));
        if (items.length !== input.items.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Item de compra inválido." });
        for (const received of input.items) {
          const item = items.find(value => value.id === received.itemId)!;
          if (Number(item.receivedQuantity) + received.receivedQuantity > Number(item.orderedQuantity)) throw new TRPCError({ code: "BAD_REQUEST", message: "Recebimento supera a quantidade pedida." });
          const balance = (await tx.select().from(inventoryBalances).where(and(eq(inventoryBalances.tenantId, input.tenantId), eq(inventoryBalances.productId, item.productId))).limit(1))[0];
          if (!balance) throw new TRPCError({ code: "BAD_REQUEST", message: "Saldo de estoque não encontrado." });
          const oldQuantity = Number(balance.physicalQuantity);
          const oldAverage = Number((await tx.select({ averageCost: products.averageCost }).from(products).where(and(eq(products.id, item.productId), eq(products.tenantId, input.tenantId))).limit(1))[0]?.averageCost ?? 0);
          const newAverage = (oldQuantity * oldAverage + received.receivedQuantity * Number(item.unitCost)) / (oldQuantity + received.receivedQuantity);
          await tx.update(purchaseOrderItems).set({ receivedQuantity: sql`${purchaseOrderItems.receivedQuantity} + ${received.receivedQuantity.toFixed(3)}` }).where(eq(purchaseOrderItems.id, item.id));
          await tx.update(inventoryBalances).set({ physicalQuantity: sql`${inventoryBalances.physicalQuantity} + ${received.receivedQuantity.toFixed(3)}` }).where(eq(inventoryBalances.id, balance.id));
          await tx.update(products).set({ currentCost: item.unitCost, averageCost: newAverage.toFixed(2) }).where(eq(products.id, item.productId));
          await tx.insert(inventoryMovements).values({ tenantId: input.tenantId, productId: item.productId, type: "purchase_entry", quantity: received.receivedQuantity.toFixed(3), physicalDelta: received.receivedQuantity.toFixed(3), reservedDelta: "0", referenceType: "purchase_order", referenceId: input.purchaseOrderId, createdByUserId: ctx.user.id });
        }
        const refreshed = await tx.select().from(purchaseOrderItems).where(and(eq(purchaseOrderItems.tenantId, input.tenantId), eq(purchaseOrderItems.purchaseOrderId, input.purchaseOrderId)));
        const complete = refreshed.every(item => Number(item.receivedQuantity) >= Number(item.orderedQuantity));
        await tx.update(purchaseOrders).set({ status: complete ? "received" : "partially_received", receivedAt: complete ? new Date() : null }).where(eq(purchaseOrders.id, input.purchaseOrderId));
      });
      await writeAuditLog({ tenantId: input.tenantId, actorUserId: ctx.user.id, action: "purchase_order.received", entityType: "purchase_order", entityId: input.purchaseOrderId });
      return { success: true };
    }),
  }),
});
