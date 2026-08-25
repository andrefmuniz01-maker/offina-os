import { and, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  customers,
  inventoryBalances,
  kitItems,
  kits,
  notifications,
  productCategories,
  products,
  serviceCategories,
  serviceProducts,
  services,
  suppliers,
  tenantSettings,
  vehicles,
  workOrders,
} from "../../drizzle/schema";
import { getDb, writeAuditLog } from "../db";
import { grossMarginPercent, suggestedSalePrice } from "../pricing";
import { getTenantAccess, hasPermission, requireTenantPermission } from "../tenantAccess";
import { protectedProcedure, router } from "../_core/trpc";

const tenantIdInput = z.object({ tenantId: z.number().int().positive() });
const decimalInput = z.coerce.number().finite().nonnegative();
const pageInput = z.object({ page: z.number().int().min(1).default(1), pageSize: z.number().int().min(1).max(100).default(25), search: z.string().trim().max(120).optional() });

function pagination(input: z.infer<typeof pageInput>) {
  return { limit: input.pageSize, offset: (input.page - 1) * input.pageSize };
}

function visibleProduct<T extends typeof products.$inferSelect>(product: T, financial: boolean) {
  if (financial) return product;
  const { currentCost, averageCost, desiredMarginPercent, ...safeProduct } = product;
  return safeProduct;
}

function resolveSellingPrice(input: { cost: number; requestedPrice: number; desiredMarginPercent: number; fallbackPrice?: number }, settings: typeof tenantSettings.$inferSelect | undefined) {
  const targetMarginPercent = input.desiredMarginPercent || Number(settings?.defaultPartsMarginPercent ?? 0);
  if (targetMarginPercent >= 100) throw new TRPCError({ code: "BAD_REQUEST", message: "A margem alvo deve ser menor que 100%." });
  const policyPrice = input.cost > 0 ? suggestedSalePrice(input.cost, targetMarginPercent) : 0;
  const price = input.requestedPrice > 0 ? input.requestedPrice : Math.max(policyPrice, input.fallbackPrice ?? 0);
  const minimumMarginPercent = Number(settings?.minimumMarginPercent ?? 0);
  if (input.cost > 0 && grossMarginPercent(price, input.cost) < minimumMarginPercent) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `O preço informado não atinge a margem mínima de ${minimumMarginPercent.toFixed(2)}% configurada para a oficina.` });
  }
  return { price, targetMarginPercent };
}

export const customerRouter = router({
  list: protectedProcedure.input(tenantIdInput.merge(pageInput)).query(async ({ ctx, input }) => {
    await requireTenantPermission(ctx.user, input.tenantId, "customers.manage");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
    const filter = input.search ? and(eq(customers.tenantId, input.tenantId), or(like(customers.name, `%${input.search}%`), like(customers.whatsapp, `%${input.search}%`))) : eq(customers.tenantId, input.tenantId);
    return db.select().from(customers).where(filter).orderBy(customers.name).limit(pagination(input).limit).offset(pagination(input).offset);
  }),
  create: protectedProcedure.input(tenantIdInput.extend({ name: z.string().trim().min(2).max(180), whatsapp: z.string().trim().min(8).max(32), email: z.string().email().optional(), document: z.string().max(32).optional(), notes: z.string().max(4000).optional() }))
    .mutation(async ({ ctx, input }) => {
      await requireTenantPermission(ctx.user, input.tenantId, "customers.manage");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
      const result = await db.insert(customers).values({ ...input, email: input.email ?? null, document: input.document ?? null, notes: input.notes ?? null });
      const id = Number(result[0].insertId);
      await writeAuditLog({ tenantId: input.tenantId, actorUserId: ctx.user.id, action: "customer.created", entityType: "customer", entityId: id, after: { name: input.name } });
      return { id };
    }),
  workOrderHistory: protectedProcedure.input(tenantIdInput.extend({ customerId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    await requireTenantPermission(ctx.user, input.tenantId, "customers.manage");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
    const customer = (await db.select({ id: customers.id }).from(customers).where(and(eq(customers.id, input.customerId), eq(customers.tenantId, input.tenantId))).limit(1))[0];
    if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "Cliente não encontrado nesta oficina." });
    return db.select({ id: workOrders.id, number: workOrders.number, status: workOrders.status, completedAt: workOrders.completedAt, deliveredAt: workOrders.deliveredAt, createdAt: workOrders.createdAt, vehicleId: vehicles.id, vehicleMake: vehicles.make, vehicleModel: vehicles.model, vehiclePlate: vehicles.plate, postSaleNotificationId: notifications.id, postSaleTitle: notifications.title, postSaleBody: notifications.body, postSaleCreatedAt: notifications.createdAt, postSaleLink: notifications.link })
      .from(workOrders)
      .innerJoin(vehicles, eq(vehicles.id, workOrders.vehicleId))
      .leftJoin(notifications, and(eq(notifications.workOrderId, workOrders.id), eq(notifications.tenantId, input.tenantId), eq(notifications.type, "post_sale_suggested")))
      .where(and(eq(workOrders.tenantId, input.tenantId), eq(workOrders.customerId, input.customerId)))
      .orderBy(desc(workOrders.createdAt));
  }),
});

export const vehicleRouter = router({
  listByCustomer: protectedProcedure.input(tenantIdInput.extend({ customerId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    await requireTenantPermission(ctx.user, input.tenantId, "customers.manage");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
    return db.select().from(vehicles).where(and(eq(vehicles.tenantId, input.tenantId), eq(vehicles.customerId, input.customerId)));
  }),
  workOrderHistory: protectedProcedure.input(tenantIdInput.extend({ vehicleId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    await requireTenantPermission(ctx.user, input.tenantId, "customers.manage");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
    const vehicle = (await db.select({ id: vehicles.id }).from(vehicles).where(and(eq(vehicles.id, input.vehicleId), eq(vehicles.tenantId, input.tenantId))).limit(1))[0];
    if (!vehicle) throw new TRPCError({ code: "NOT_FOUND", message: "Veículo não encontrado nesta oficina." });
    return db.select({ id: workOrders.id, number: workOrders.number, status: workOrders.status, completedAt: workOrders.completedAt, deliveredAt: workOrders.deliveredAt, createdAt: workOrders.createdAt, postSaleNotificationId: notifications.id, postSaleTitle: notifications.title, postSaleBody: notifications.body, postSaleCreatedAt: notifications.createdAt, postSaleLink: notifications.link }).from(workOrders).leftJoin(notifications, and(eq(notifications.workOrderId, workOrders.id), eq(notifications.tenantId, input.tenantId), eq(notifications.type, "post_sale_suggested"))).where(and(eq(workOrders.tenantId, input.tenantId), eq(workOrders.vehicleId, input.vehicleId))).orderBy(desc(workOrders.createdAt));
  }),
  create: protectedProcedure.input(tenantIdInput.extend({
    customerId: z.number().int().positive(), make: z.string().trim().min(1).max(100), model: z.string().trim().min(1).max(140), modelYear: z.number().int().min(1900).max(2100).optional(), manufactureYear: z.number().int().min(1900).max(2100).optional(), plate: z.string().trim().max(16).optional(), mileage: z.number().int().nonnegative().optional(), engine: z.string().trim().max(120).optional(), notes: z.string().max(4000).optional(),
  })).mutation(async ({ ctx, input }) => {
    await requireTenantPermission(ctx.user, input.tenantId, "customers.manage");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
    const customer = (await db.select({ id: customers.id }).from(customers).where(and(eq(customers.id, input.customerId), eq(customers.tenantId, input.tenantId))).limit(1))[0];
    if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "Cliente não encontrado nesta oficina." });
    const result = await db.insert(vehicles).values({ ...input, modelYear: input.modelYear ?? null, manufactureYear: input.manufactureYear ?? null, plate: input.plate ?? null, mileage: input.mileage ?? null, engine: input.engine ?? null, notes: input.notes ?? null });
    const id = Number(result[0].insertId);
    await writeAuditLog({ tenantId: input.tenantId, actorUserId: ctx.user.id, action: "vehicle.created", entityType: "vehicle", entityId: id, after: { make: input.make, model: input.model } });
    return { id };
  }),
});

export const catalogRouter = router({
  categories: router({
    listProducts: protectedProcedure.input(tenantIdInput).query(async ({ ctx, input }) => {
      await requireTenantPermission(ctx.user, input.tenantId, "catalog.manage");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
      return db.select().from(productCategories).where(eq(productCategories.tenantId, input.tenantId)).orderBy(productCategories.name);
    }),
    createProduct: protectedProcedure.input(tenantIdInput.extend({ name: z.string().trim().min(2).max(120), description: z.string().max(1000).optional() })).mutation(async ({ ctx, input }) => {
      await requireTenantPermission(ctx.user, input.tenantId, "catalog.manage");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
      const result = await db.insert(productCategories).values({ tenantId: input.tenantId, name: input.name, description: input.description ?? null });
      return { id: Number(result[0].insertId) };
    }),
    listServices: protectedProcedure.input(tenantIdInput).query(async ({ ctx, input }) => {
      await requireTenantPermission(ctx.user, input.tenantId, "catalog.manage");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
      return db.select().from(serviceCategories).where(eq(serviceCategories.tenantId, input.tenantId)).orderBy(serviceCategories.name);
    }),
    createService: protectedProcedure.input(tenantIdInput.extend({ name: z.string().trim().min(2).max(120), description: z.string().max(1000).optional() })).mutation(async ({ ctx, input }) => {
      await requireTenantPermission(ctx.user, input.tenantId, "catalog.manage");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
      const result = await db.insert(serviceCategories).values({ tenantId: input.tenantId, name: input.name, description: input.description ?? null });
      return { id: Number(result[0].insertId) };
    }),
  }),

  suppliers: router({
    list: protectedProcedure.input(tenantIdInput.merge(pageInput)).query(async ({ ctx, input }) => {
      await requireTenantPermission(ctx.user, input.tenantId, "catalog.manage");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
      const filter = input.search ? and(eq(suppliers.tenantId, input.tenantId), like(suppliers.name, `%${input.search}%`)) : eq(suppliers.tenantId, input.tenantId);
      return db.select().from(suppliers).where(filter).orderBy(suppliers.name).limit(pagination(input).limit).offset(pagination(input).offset);
    }),
    create: protectedProcedure.input(tenantIdInput.extend({ name: z.string().trim().min(2).max(180), document: z.string().max(32).optional(), contactName: z.string().max(160).optional(), phone: z.string().max(32).optional(), email: z.string().email().optional(), notes: z.string().max(4000).optional() })).mutation(async ({ ctx, input }) => {
      await requireTenantPermission(ctx.user, input.tenantId, "catalog.manage");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
      const result = await db.insert(suppliers).values({ ...input, document: input.document ?? null, contactName: input.contactName ?? null, phone: input.phone ?? null, email: input.email ?? null, notes: input.notes ?? null });
      return { id: Number(result[0].insertId) };
    }),
  }),

  products: router({
    list: protectedProcedure.input(tenantIdInput.merge(pageInput)).query(async ({ ctx, input }) => {
      const access = await requireTenantPermission(ctx.user, input.tenantId, "catalog.manage");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
      const filter = input.search ? and(eq(products.tenantId, input.tenantId), or(like(products.name, `%${input.search}%`), like(products.sku, `%${input.search}%`))) : eq(products.tenantId, input.tenantId);
      const rows = await db.select({ product: products, balance: inventoryBalances }).from(products).leftJoin(inventoryBalances, and(eq(inventoryBalances.tenantId, products.tenantId), eq(inventoryBalances.productId, products.id))).where(filter).orderBy(products.name).limit(pagination(input).limit).offset(pagination(input).offset);
      const financial = hasPermission(access, "financial.view");
      return rows.map(({ product, balance }) => ({ ...visibleProduct(product, financial), physicalQuantity: balance?.physicalQuantity ?? "0", reservedQuantity: balance?.reservedQuantity ?? "0" }));
    }),
    create: protectedProcedure.input(tenantIdInput.extend({
      categoryId: z.number().int().positive().optional(), supplierId: z.number().int().positive().optional(), name: z.string().trim().min(2).max(180), sku: z.string().trim().max(96).optional(), brand: z.string().trim().max(100).optional(), unit: z.string().trim().min(1).max(16).default("un"), currentCost: decimalInput.default(0), salePrice: decimalInput.default(0), desiredMarginPercent: decimalInput.max(99.99).default(0), minStock: decimalInput.default(0), maxStock: decimalInput.optional(), location: z.string().trim().max(120).optional(), barcode: z.string().trim().max(96).optional(), description: z.string().max(4000).optional(),
    })).mutation(async ({ ctx, input }) => {
      const access = await requireTenantPermission(ctx.user, input.tenantId, "catalog.manage");
      const includesFinancial = input.currentCost > 0 || input.desiredMarginPercent > 0;
      if (includesFinancial && !hasPermission(access, "financial.manage")) throw new TRPCError({ code: "FORBIDDEN", message: "Seu perfil não pode informar custo ou margem." });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
      const settings = (await db.select().from(tenantSettings).where(eq(tenantSettings.tenantId, input.tenantId)).limit(1))[0];
      const pricing = resolveSellingPrice({ cost: input.currentCost, requestedPrice: input.salePrice, desiredMarginPercent: input.desiredMarginPercent }, settings);
      if (input.categoryId) {
        const category = (await db.select({ id: productCategories.id }).from(productCategories).where(and(eq(productCategories.id, input.categoryId), eq(productCategories.tenantId, input.tenantId))).limit(1))[0];
        if (!category) throw new TRPCError({ code: "BAD_REQUEST", message: "A categoria não pertence a esta oficina." });
      }
      if (input.supplierId) {
        const supplier = (await db.select({ id: suppliers.id }).from(suppliers).where(and(eq(suppliers.id, input.supplierId), eq(suppliers.tenantId, input.tenantId))).limit(1))[0];
        if (!supplier) throw new TRPCError({ code: "BAD_REQUEST", message: "O fornecedor não pertence a esta oficina." });
      }
      const productId = await db.transaction(async (tx) => {
        const result = await tx.insert(products).values({
          tenantId: input.tenantId, categoryId: input.categoryId ?? null, supplierId: input.supplierId ?? null, name: input.name, sku: input.sku ?? null, brand: input.brand ?? null, unit: input.unit, currentCost: input.currentCost.toFixed(2), averageCost: input.currentCost.toFixed(2), salePrice: pricing.price.toFixed(2), desiredMarginPercent: pricing.targetMarginPercent.toFixed(2), minStock: input.minStock.toFixed(3), maxStock: input.maxStock?.toFixed(3) ?? null, location: input.location ?? null, barcode: input.barcode ?? null, description: input.description ?? null,
        });
        const id = Number(result[0].insertId);
        await tx.insert(inventoryBalances).values({ tenantId: input.tenantId, productId: id });
        return id;
      });
      await writeAuditLog({ tenantId: input.tenantId, actorUserId: ctx.user.id, action: "product.created", entityType: "product", entityId: productId, after: { name: input.name, sku: input.sku } });
      return { id: productId };
    }),
    updateFinancial: protectedProcedure.input(tenantIdInput.extend({ productId: z.number().int().positive(), currentCost: decimalInput, salePrice: decimalInput, desiredMarginPercent: decimalInput.max(99.99) })).mutation(async ({ ctx, input }) => {
      await requireTenantPermission(ctx.user, input.tenantId, "financial.manage");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
      const product = (await db.select().from(products).where(and(eq(products.id, input.productId), eq(products.tenantId, input.tenantId))).limit(1))[0];
      if (!product) throw new TRPCError({ code: "NOT_FOUND", message: "Produto não encontrado nesta oficina." });
      const settings = (await db.select().from(tenantSettings).where(eq(tenantSettings.tenantId, input.tenantId)).limit(1))[0];
      const pricing = resolveSellingPrice({ cost: input.currentCost, requestedPrice: input.salePrice, desiredMarginPercent: input.desiredMarginPercent }, settings);
      await db.update(products).set({ currentCost: input.currentCost.toFixed(2), salePrice: pricing.price.toFixed(2), desiredMarginPercent: pricing.targetMarginPercent.toFixed(2) }).where(eq(products.id, input.productId));
      await writeAuditLog({ tenantId: input.tenantId, actorUserId: ctx.user.id, action: "product.financial_updated", entityType: "product", entityId: input.productId, before: { currentCost: product.currentCost, salePrice: product.salePrice, desiredMarginPercent: product.desiredMarginPercent }, after: { currentCost: input.currentCost, salePrice: pricing.price, desiredMarginPercent: pricing.targetMarginPercent } });
      return { success: true };
    }),
  }),

  services: router({
    list: protectedProcedure.input(tenantIdInput.merge(pageInput)).query(async ({ ctx, input }) => {
      const access = await requireTenantPermission(ctx.user, input.tenantId, "catalog.manage");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
      const filter = input.search ? and(eq(services.tenantId, input.tenantId), like(services.name, `%${input.search}%`)) : eq(services.tenantId, input.tenantId);
      const rows = await db.select().from(services).where(filter).orderBy(services.name).limit(pagination(input).limit).offset(pagination(input).offset);
      return rows.map(service => {
        if (hasPermission(access, "financial.view")) return service;
        const { estimatedCost, desiredMarginPercent, ...safeService } = service;
        return safeService;
      });
    }),
    create: protectedProcedure.input(tenantIdInput.extend({ categoryId: z.number().int().positive().optional(), name: z.string().trim().min(2).max(180), description: z.string().max(4000).optional(), estimatedMinutes: z.number().int().min(5).max(1440).default(60), laborPrice: decimalInput.default(0), estimatedCost: decimalInput.default(0), desiredMarginPercent: decimalInput.max(99.99).default(0), quoteQuestions: z.array(z.object({ id: z.string().min(1).max(64), label: z.string().min(1).max(200), required: z.boolean().optional(), type: z.string().max(40).optional(), options: z.array(z.string().max(120)).max(20).optional() })).max(30).optional() }))
      .mutation(async ({ ctx, input }) => {
        const access = await requireTenantPermission(ctx.user, input.tenantId, "catalog.manage");
        if ((input.estimatedCost > 0 || input.desiredMarginPercent > 0) && !hasPermission(access, "financial.manage")) throw new TRPCError({ code: "FORBIDDEN", message: "Seu perfil não pode informar custo ou margem." });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
        const settings = (await db.select().from(tenantSettings).where(eq(tenantSettings.tenantId, input.tenantId)).limit(1))[0];
        const pricing = resolveSellingPrice({ cost: input.estimatedCost, requestedPrice: input.laborPrice, desiredMarginPercent: input.desiredMarginPercent, fallbackPrice: Number(settings?.defaultLaborHourlyRate ?? 0) * input.estimatedMinutes / 60 }, settings);
        if (input.categoryId) {
          const category = (await db.select({ id: serviceCategories.id }).from(serviceCategories).where(and(eq(serviceCategories.id, input.categoryId), eq(serviceCategories.tenantId, input.tenantId))).limit(1))[0];
          if (!category) throw new TRPCError({ code: "BAD_REQUEST", message: "A categoria não pertence a esta oficina." });
        }
        const result = await db.insert(services).values({ tenantId: input.tenantId, categoryId: input.categoryId ?? null, name: input.name, description: input.description ?? null, estimatedMinutes: input.estimatedMinutes, laborPrice: pricing.price.toFixed(2), estimatedCost: input.estimatedCost.toFixed(2), desiredMarginPercent: pricing.targetMarginPercent.toFixed(2), quoteQuestions: input.quoteQuestions ?? null });
        return { id: Number(result[0].insertId) };
      }),
    updateFinancial: protectedProcedure.input(tenantIdInput.extend({ serviceId: z.number().int().positive(), laborPrice: decimalInput, estimatedCost: decimalInput, desiredMarginPercent: decimalInput.max(99.99) })).mutation(async ({ ctx, input }) => {
      await requireTenantPermission(ctx.user, input.tenantId, "financial.manage");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
      const service = (await db.select().from(services).where(and(eq(services.id, input.serviceId), eq(services.tenantId, input.tenantId))).limit(1))[0];
      if (!service) throw new TRPCError({ code: "NOT_FOUND", message: "Serviço não encontrado nesta oficina." });
      const settings = (await db.select().from(tenantSettings).where(eq(tenantSettings.tenantId, input.tenantId)).limit(1))[0];
      const pricing = resolveSellingPrice({ cost: input.estimatedCost, requestedPrice: input.laborPrice, desiredMarginPercent: input.desiredMarginPercent, fallbackPrice: Number(settings?.defaultLaborHourlyRate ?? 0) * Number(service.estimatedMinutes) / 60 }, settings);
      await db.update(services).set({ laborPrice: pricing.price.toFixed(2), estimatedCost: input.estimatedCost.toFixed(2), desiredMarginPercent: pricing.targetMarginPercent.toFixed(2) }).where(eq(services.id, input.serviceId));
      await writeAuditLog({ tenantId: input.tenantId, actorUserId: ctx.user.id, action: "service.financial_updated", entityType: "service", entityId: input.serviceId, before: { laborPrice: service.laborPrice, estimatedCost: service.estimatedCost, desiredMarginPercent: service.desiredMarginPercent }, after: { laborPrice: pricing.price, estimatedCost: input.estimatedCost, desiredMarginPercent: pricing.targetMarginPercent } });
      return { success: true };
    }),
    setProducts: protectedProcedure.input(tenantIdInput.extend({ serviceId: z.number().int().positive(), items: z.array(z.object({ productId: z.number().int().positive(), quantity: decimalInput.positive(), required: z.boolean().default(true) })).min(1).max(100) })).mutation(async ({ ctx, input }) => {
      await requireTenantPermission(ctx.user, input.tenantId, "catalog.manage");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
      const service = (await db.select({ id: services.id }).from(services).where(and(eq(services.id, input.serviceId), eq(services.tenantId, input.tenantId))).limit(1))[0];
      if (!service) throw new TRPCError({ code: "NOT_FOUND", message: "Serviço não encontrado nesta oficina." });
      const productRows = await db.select({ id: products.id }).from(products).where(and(eq(products.tenantId, input.tenantId), inArray(products.id, input.items.map(item => item.productId))));
      if (productRows.length !== input.items.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Um ou mais produtos não pertencem a esta oficina." });
      await db.transaction(async (tx) => {
        await tx.delete(serviceProducts).where(and(eq(serviceProducts.tenantId, input.tenantId), eq(serviceProducts.serviceId, input.serviceId)));
        await tx.insert(serviceProducts).values(input.items.map(item => ({ tenantId: input.tenantId, serviceId: input.serviceId, productId: item.productId, quantity: item.quantity.toFixed(3), required: item.required })));
      });
      return { success: true };
    }),
  }),

  kits: router({
    list: protectedProcedure.input(tenantIdInput.merge(pageInput)).query(async ({ ctx, input }) => {
      await requireTenantPermission(ctx.user, input.tenantId, "catalog.manage");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
      const filter = input.search ? and(eq(kits.tenantId, input.tenantId), like(kits.name, `%${input.search}%`)) : eq(kits.tenantId, input.tenantId);
      return db.select().from(kits).where(filter).orderBy(kits.name).limit(pagination(input).limit).offset(pagination(input).offset);
    }),
    create: protectedProcedure.input(tenantIdInput.extend({ categoryId: z.number().int().positive().optional(), name: z.string().trim().min(2).max(180), description: z.string().max(4000).optional(), salePriceOverride: decimalInput.optional(), items: z.array(z.object({ productId: z.number().int().positive().optional(), serviceId: z.number().int().positive().optional(), quantity: decimalInput.positive() }).refine(value => Boolean(value.productId) !== Boolean(value.serviceId), "Cada item deve ser um produto ou um serviço.")).min(1).max(100) }))
      .mutation(async ({ ctx, input }) => {
        await requireTenantPermission(ctx.user, input.tenantId, "catalog.manage");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
        if (input.categoryId) {
          const category = (await db.select({ id: serviceCategories.id }).from(serviceCategories).where(and(eq(serviceCategories.id, input.categoryId), eq(serviceCategories.tenantId, input.tenantId))).limit(1))[0];
          if (!category) throw new TRPCError({ code: "BAD_REQUEST", message: "A categoria não pertence a esta oficina." });
        }
        const productIds = input.items.flatMap(item => item.productId ? [item.productId] : []);
        const serviceIds = input.items.flatMap(item => item.serviceId ? [item.serviceId] : []);
        if (productIds.length) {
          const rows = await db.select({ id: products.id }).from(products).where(and(eq(products.tenantId, input.tenantId), inArray(products.id, productIds)));
          if (rows.length !== productIds.length) throw new TRPCError({ code: "BAD_REQUEST", message: "O kit possui produto de outra oficina." });
        }
        if (serviceIds.length) {
          const rows = await db.select({ id: services.id }).from(services).where(and(eq(services.tenantId, input.tenantId), inArray(services.id, serviceIds)));
          if (rows.length !== serviceIds.length) throw new TRPCError({ code: "BAD_REQUEST", message: "O kit possui serviço de outra oficina." });
        }
        const kitId = await db.transaction(async (tx) => {
          const result = await tx.insert(kits).values({ tenantId: input.tenantId, categoryId: input.categoryId ?? null, name: input.name, description: input.description ?? null, salePriceOverride: input.salePriceOverride?.toFixed(2) ?? null });
          const id = Number(result[0].insertId);
          await tx.insert(kitItems).values(input.items.map(item => ({ tenantId: input.tenantId, kitId: id, productId: item.productId ?? null, serviceId: item.serviceId ?? null, quantity: item.quantity.toFixed(3) })));
          return id;
        });
        return { id: kitId };
      }),
    preview: protectedProcedure.input(tenantIdInput.extend({ kitId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const access = await requireTenantPermission(ctx.user, input.tenantId, "catalog.manage");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
      const kit = (await db.select().from(kits).where(and(eq(kits.id, input.kitId), eq(kits.tenantId, input.tenantId))).limit(1))[0];
      if (!kit) throw new TRPCError({ code: "NOT_FOUND", message: "Kit não encontrado nesta oficina." });
      const items = await db.select().from(kitItems).where(and(eq(kitItems.tenantId, input.tenantId), eq(kitItems.kitId, input.kitId)));
      const productIds = items.flatMap(item => item.productId ? [item.productId] : []);
      const serviceIds = items.flatMap(item => item.serviceId ? [item.serviceId] : []);
      const productRows = productIds.length ? await db.select({ product: products, balance: inventoryBalances }).from(products).leftJoin(inventoryBalances, and(eq(inventoryBalances.tenantId, products.tenantId), eq(inventoryBalances.productId, products.id))).where(and(eq(products.tenantId, input.tenantId), inArray(products.id, productIds))) : [];
      const serviceRows = serviceIds.length ? await db.select().from(services).where(and(eq(services.tenantId, input.tenantId), inArray(services.id, serviceIds))) : [];
      const productMap = new Map(productRows.map(row => [row.product.id, row]));
      const serviceMap = new Map(serviceRows.map(service => [service.id, service]));
      const detail = items.map(item => {
        const quantity = Number(item.quantity);
        if (item.productId) {
          const row = productMap.get(item.productId);
          if (!row) throw new TRPCError({ code: "BAD_REQUEST", message: "O kit contém um produto inválido para esta oficina." });
          const available = Number(row.balance?.physicalQuantity ?? 0) - Number(row.balance?.reservedQuantity ?? 0);
          return { type: "product" as const, productId: row.product.id, label: row.product.name, quantity, unitPrice: Number(row.product.salePrice), unitCost: Number(row.product.currentCost), available, availability: available >= quantity ? "available" as const : available > 0 ? "insufficient" as const : "unavailable" as const };
        }
        const service = serviceMap.get(item.serviceId!);
        if (!service) throw new TRPCError({ code: "BAD_REQUEST", message: "O kit contém um serviço inválido para esta oficina." });
        return { type: "service" as const, serviceId: service.id, label: service.name, quantity, unitPrice: Number(service.laborPrice), unitCost: Number(service.estimatedCost), availability: "available" as const };
      });
      const totalCost = detail.reduce((sum, item) => sum + item.unitCost * item.quantity, 0);
      const calculatedPrice = detail.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
      const price = kit.salePriceOverride === null ? calculatedPrice : Number(kit.salePriceOverride);
      const financial = hasPermission(access, "financial.view");
      return { kit: { id: kit.id, name: kit.name, description: kit.description }, items: financial ? detail : detail.map(({ unitCost, ...safe }) => safe), price, ...(financial ? { totalCost, marginPercent: price > 0 ? ((price - totalCost) / price) * 100 : 0 } : {}) };
    }),
  }),
});
