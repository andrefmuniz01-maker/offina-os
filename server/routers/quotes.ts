import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import {
  attachments,
  customers,
  inventoryBalances,
  inventoryMovements,
  inventoryReservations,
  products,
  quoteEvents,
  quoteItems,
  quoteRequestEvents,
  quoteRequests,
  quotes,
  serviceProducts,
  services,
  tenantBranding,
  tenantMembers,
  tenantSettings,
  tenants,
  users,
  vehicles,
} from "../../drizzle/schema";
import { getDb, writeAuditLog } from "../db";
import { calculateQuotePricing, discountPolicyViolation } from "../pricing";
import { storagePut } from "../storage";
import { getTenantAccess, hasPermission, requireTenantPermission } from "../tenantAccess";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";

const tenantIdInput = z.object({ tenantId: z.number().int().positive() });
const requestStatus = z.enum(["new", "in_analysis", "awaiting_information", "in_quoting", "ready", "sent", "approved", "rejected", "expired", "cancelled"]);
const allowedRequestTransitions: Record<z.infer<typeof requestStatus>, z.infer<typeof requestStatus>[]> = {
  new: ["in_analysis", "cancelled"],
  in_analysis: ["awaiting_information", "in_quoting", "cancelled"],
  awaiting_information: ["in_analysis", "cancelled"],
  in_quoting: ["ready", "awaiting_information", "cancelled"],
  ready: ["sent", "in_quoting", "cancelled"],
  sent: ["approved", "rejected", "expired", "in_quoting"],
  approved: [],
  rejected: ["in_quoting"],
  expired: ["in_quoting", "cancelled"],
  cancelled: [],
};

export function isRequestTransitionAllowed(current: z.infer<typeof requestStatus>, next: z.infer<typeof requestStatus>) {
  return current === next || allowedRequestTransitions[current].includes(next);
}

export function calculateRequestQueueMinutes(createdAt: Date, lastStatusChangedAt: Date | undefined, now = new Date()) {
  return Math.max(0, Math.floor((now.getTime() - (lastStatusChangedAt ?? createdAt).getTime()) / 60_000));
}

const quoteStatus = z.enum(["draft", "ready", "sent", "viewed", "approved", "rejected", "expired", "cancelled"]);
const allowedQuoteTransitions: Record<z.infer<typeof quoteStatus>, z.infer<typeof quoteStatus>[]> = {
  draft: ["ready", "cancelled"],
  ready: ["sent", "cancelled"],
  sent: ["viewed", "approved", "rejected", "expired", "cancelled"],
  viewed: ["approved", "rejected", "expired", "cancelled"],
  approved: [],
  rejected: ["ready"],
  expired: ["ready", "cancelled"],
  cancelled: [],
};

export function isQuoteTransitionAllowed(current: z.infer<typeof quoteStatus>, next: z.infer<typeof quoteStatus>) {
  return current === next || allowedQuoteTransitions[current].includes(next);
}

export function buildReservationPlan(
  items: Array<{ productId: number | null; quantity: string }>,
  balances: Array<{ productId: number; physicalQuantity: string; reservedQuantity: string }>,
) {
  const quantities = new Map<number, number>();
  for (const item of items) {
    if (!item.productId) continue;
    quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + Number(item.quantity));
  }
  const balanceByProduct = new Map(balances.map(balance => [balance.productId, balance]));
  return Array.from(quantities, ([productId, quantity]) => {
    const balance = balanceByProduct.get(productId);
    const available = balance ? Number(balance.physicalQuantity) - Number(balance.reservedQuantity) : 0;
    return { productId, quantity, available, reservable: available >= quantity };
  });
}

function assertRequestTransition(current: z.infer<typeof requestStatus>, next: z.infer<typeof requestStatus>) {
  if (current === next) return;
  if (!isRequestTransitionAllowed(current, next)) throw new TRPCError({ code: "BAD_REQUEST", message: `Não é permitido mudar a solicitação de ${current} para ${next}.` });
}
const publicRequestInput = z.object({
  tenantSlug: z.string().trim().toLowerCase().min(2).max(96),
  name: z.string().trim().min(2).max(180),
  whatsapp: z.string().trim().min(8).max(32),
  email: z.string().email().optional(),
  make: z.string().trim().min(1).max(100),
  model: z.string().trim().min(1).max(140),
  modelYear: z.number().int().min(1900).max(2100).optional(),
  plate: z.string().trim().max(16).optional(),
  mileage: z.number().int().nonnegative().optional(),
  serviceId: z.number().int().positive().optional(),
  serviceLabel: z.string().trim().min(2).max(180),
  description: z.string().trim().max(5000).optional(),
  answers: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  attachments: z.array(z.object({ filename: z.string().min(1).max(180), mimeType: z.string().min(3).max(120), base64: z.string().min(8).max(7_000_000) })).max(5).optional(),
});

type SuggestionItem = {
  itemType: "product" | "service";
  productId?: number;
  serviceId?: number;
  description: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  available?: number;
  availability: "available" | "insufficient" | "unavailable";
};

async function buildSuggestion(tenantId: number, serviceId: number): Promise<SuggestionItem[]> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
  const service = (await db.select().from(services).where(and(eq(services.id, serviceId), eq(services.tenantId, tenantId), eq(services.active, true))).limit(1))[0];
  if (!service) throw new TRPCError({ code: "NOT_FOUND", message: "Serviço não encontrado no catálogo desta oficina." });
  const linked = await db.select({ relation: serviceProducts, product: products, balance: inventoryBalances }).from(serviceProducts)
    .innerJoin(products, and(eq(products.id, serviceProducts.productId), eq(products.tenantId, serviceProducts.tenantId)))
    .leftJoin(inventoryBalances, and(eq(inventoryBalances.productId, products.id), eq(inventoryBalances.tenantId, products.tenantId)))
    .where(and(eq(serviceProducts.tenantId, tenantId), eq(serviceProducts.serviceId, serviceId)));
  const items: SuggestionItem[] = linked.map(({ relation, product, balance }) => {
    const quantity = Number(relation.quantity);
    const available = Number(balance?.physicalQuantity ?? 0) - Number(balance?.reservedQuantity ?? 0);
    return {
      itemType: "product", productId: product.id, description: product.name, quantity,
      unitPrice: Number(product.salePrice), unitCost: Number(product.currentCost), available,
      availability: available >= quantity ? "available" : available > 0 ? "insufficient" : "unavailable",
    };
  });
  items.push({ itemType: "service", serviceId: service.id, description: service.name, quantity: 1, unitPrice: Number(service.laborPrice), unitCost: Number(service.estimatedCost), availability: "available" });
  return items;
}

function publicQuoteItems(items: typeof quoteItems.$inferSelect[]) {
  return items.map(item => ({ id: item.id, itemType: item.itemType, description: item.description, quantity: Number(item.quantity), unitPrice: Number(item.unitPrice), discount: Number(item.discount), total: Number(item.quantity) * Number(item.unitPrice) - Number(item.discount) }));
}

const defaultQuoteMessageTemplate = "Olá, {{cliente}}! Seu orçamento para {{veiculo}} está pronto. Total: {{total}}. Consulte os detalhes e responda aqui: {{link}}";

export function renderQuoteMessage(template: string | null | undefined, values: { client: string; vehicle: string; total: string; link: string; workshop: string }) {
  const placeholders: Record<string, string> = { "{{cliente}}": values.client, "{{veiculo}}": values.vehicle, "{{total}}": values.total, "{{link}}": values.link, "{{oficina}}": values.workshop };
  return Object.entries(placeholders).reduce((message, [token, value]) => message.replaceAll(token, value), template?.trim() || defaultQuoteMessageTemplate);
}

export const quoteRequestRouter = router({
  publicServices: publicProcedure.input(z.object({ tenantSlug: z.string().trim().toLowerCase().min(2).max(96) })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
    const tenant = (await db.select({ id: tenants.id, name: tenants.name, active: tenants.active }).from(tenants).where(and(eq(tenants.slug, input.tenantSlug), eq(tenants.active, true), eq(tenants.status, "active"))).limit(1))[0];
    if (!tenant) return null;
    const branding = (await db.select().from(tenantBranding).where(eq(tenantBranding.tenantId, tenant.id)).limit(1))[0] ?? null;
    const catalog = await db.select({ id: services.id, name: services.name, description: services.description, quoteQuestions: services.quoteQuestions }).from(services).where(and(eq(services.tenantId, tenant.id), eq(services.active, true))).orderBy(asc(services.name));
    return { workshop: { ...tenant, branding }, services: catalog };
  }),
  submitPublic: publicProcedure.input(publicRequestInput).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
    const tenant = (await db.select().from(tenants).where(and(eq(tenants.slug, input.tenantSlug), eq(tenants.active, true), eq(tenants.status, "active"))).limit(1))[0];
    if (!tenant) throw new TRPCError({ code: "NOT_FOUND", message: "A oficina solicitada não está disponível." });
    if (input.serviceId) {
      const validService = (await db.select({ id: services.id }).from(services).where(and(eq(services.id, input.serviceId), eq(services.tenantId, tenant.id), eq(services.active, true))).limit(1))[0];
      if (!validService) throw new TRPCError({ code: "BAD_REQUEST", message: "O serviço selecionado não pertence a esta oficina." });
    }
    const result = await db.transaction(async (tx) => {
      const existingCustomer = (await tx.select().from(customers).where(and(eq(customers.tenantId, tenant.id), eq(customers.whatsapp, input.whatsapp))).limit(1))[0];
      const customerId = existingCustomer?.id ?? Number((await tx.insert(customers).values({ tenantId: tenant.id, name: input.name, whatsapp: input.whatsapp, email: input.email ?? null }))[0].insertId);
      const existingVehicle = input.plate ? (await tx.select().from(vehicles).where(and(eq(vehicles.tenantId, tenant.id), eq(vehicles.customerId, customerId), eq(vehicles.plate, input.plate))).limit(1))[0] : undefined;
      const vehicleId = existingVehicle?.id ?? Number((await tx.insert(vehicles).values({ tenantId: tenant.id, customerId, make: input.make, model: input.model, modelYear: input.modelYear ?? null, plate: input.plate ?? null, mileage: input.mileage ?? null }))[0].insertId);
      const next = (await tx.select({ value: sql<number>`coalesce(max(${quoteRequests.number}), 0) + 1` }).from(quoteRequests).where(eq(quoteRequests.tenantId, tenant.id)))[0]?.value ?? 1;
      const request = await tx.insert(quoteRequests).values({
        tenantId: tenant.id, number: Number(next), customerId, vehicleId, serviceId: input.serviceId ?? null,
        requesterName: input.name, requesterWhatsapp: input.whatsapp, requesterEmail: input.email ?? null,
        vehicleSnapshot: { make: input.make, model: input.model, modelYear: input.modelYear ?? null, plate: input.plate ?? null, mileage: input.mileage ?? null },
        serviceLabel: input.serviceLabel, description: input.description ?? null, answers: input.answers ?? null, source: "public_link",
      });
      const requestId = Number(request[0].insertId);
      await tx.insert(quoteRequestEvents).values({ tenantId: tenant.id, quoteRequestId: requestId, type: "created", metadata: { source: "public_link" } });
      return { requestId, number: Number(next) };
    });
    const members = await db.select({ userId: tenantMembers.userId }).from(tenantMembers).where(and(eq(tenantMembers.tenantId, tenant.id), eq(tenantMembers.active, true)));
    if (members.length) {
      const { notifications } = await import("../../drizzle/schema");
      await db.insert(notifications).values(members.map(member => ({ tenantId: tenant.id, userId: member.userId, type: "quote_request.created", title: "Nova solicitação de orçamento", body: `${input.name} solicitou ${input.serviceLabel}.`, link: `/solicitacoes/${result.requestId}` })));
    }
    if (input.attachments?.length) {
      for (const file of input.attachments) {
        if (!file.mimeType.startsWith("image/") && !file.mimeType.startsWith("video/")) throw new TRPCError({ code: "BAD_REQUEST", message: "Envie apenas fotos ou vídeos." });
        const buffer = Buffer.from(file.base64.replace(/^data:[^;]+;base64,/, ""), "base64");
        if (buffer.length > 5 * 1024 * 1024) throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "Cada anexo deve ter no máximo 5 MB." });
        const filename = file.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
        const uploaded = await storagePut(`tenants/${tenant.id}/quote-requests/${result.requestId}/${filename}`, buffer, file.mimeType);
        await db.insert(attachments).values({ tenantId: tenant.id, quoteRequestId: result.requestId, storageKey: uploaded.key, url: uploaded.url, filename, mimeType: file.mimeType, sizeBytes: buffer.length });
      }
    }
    return { requestId: result.requestId, number: result.number };
  }),

  list: protectedProcedure.input(tenantIdInput.extend({ status: z.enum(["new", "in_analysis", "awaiting_information", "in_quoting", "ready", "sent", "approved", "rejected", "expired", "cancelled"]).optional(), page: z.number().int().min(1).default(1), pageSize: z.number().int().min(1).max(100).default(25) })).query(async ({ ctx, input }) => {
    await requireTenantPermission(ctx.user, input.tenantId, "quotes.manage");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
    const rows = await db.select({ request: quoteRequests, customer: customers, vehicle: vehicles, assignedUser: { id: users.id, name: users.name, email: users.email } }).from(quoteRequests)
      .leftJoin(customers, eq(customers.id, quoteRequests.customerId)).leftJoin(vehicles, eq(vehicles.id, quoteRequests.vehicleId))
      .leftJoin(users, eq(users.id, quoteRequests.assignedToUserId))
      .where(input.status ? and(eq(quoteRequests.tenantId, input.tenantId), eq(quoteRequests.status, input.status)) : eq(quoteRequests.tenantId, input.tenantId))
      .orderBy(desc(quoteRequests.createdAt)).limit(input.pageSize + 1).offset((input.page - 1) * input.pageSize);
    const pageRows = rows.slice(0, input.pageSize);
    const requestIds = pageRows.map(row => row.request.id);
    const statusEvents = requestIds.length ? await db.select({ quoteRequestId: quoteRequestEvents.quoteRequestId, createdAt: quoteRequestEvents.createdAt }).from(quoteRequestEvents)
      .where(and(eq(quoteRequestEvents.tenantId, input.tenantId), inArray(quoteRequestEvents.quoteRequestId, requestIds), eq(quoteRequestEvents.type, "status_changed")))
      .orderBy(desc(quoteRequestEvents.createdAt)) : [];
    const lastStatusChangedAt = new Map<number, Date>();
    for (const event of statusEvents) if (!lastStatusChangedAt.has(event.quoteRequestId)) lastStatusChangedAt.set(event.quoteRequestId, event.createdAt);
    return { items: pageRows.map(row => ({ ...row, queueMinutes: calculateRequestQueueMinutes(row.request.createdAt, lastStatusChangedAt.get(row.request.id)) })), page: input.page, pageSize: input.pageSize, hasMore: rows.length > input.pageSize };
  }),

  assignees: protectedProcedure.input(tenantIdInput).query(async ({ ctx, input }) => {
    await requireTenantPermission(ctx.user, input.tenantId, "quotes.manage");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
    return db.select({ id: users.id, name: users.name, role: tenantMembers.role }).from(tenantMembers)
      .innerJoin(users, eq(users.id, tenantMembers.userId))
      .where(and(eq(tenantMembers.tenantId, input.tenantId), eq(tenantMembers.active, true)))
      .orderBy(asc(users.name));
  }),

  updateStatus: protectedProcedure.input(tenantIdInput.extend({ quoteRequestId: z.number().int().positive(), status: requestStatus, assignedToUserId: z.number().int().positive().nullable().optional(), note: z.string().trim().max(2000).optional() })).mutation(async ({ ctx, input }) => {
    await requireTenantPermission(ctx.user, input.tenantId, "quotes.manage");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
    const request = (await db.select().from(quoteRequests).where(and(eq(quoteRequests.id, input.quoteRequestId), eq(quoteRequests.tenantId, input.tenantId))).limit(1))[0];
    if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "Solicitação não encontrada." });
    assertRequestTransition(request.status, input.status);
    let assignedUserName: string | null = null;
    if (input.assignedToUserId !== undefined && input.assignedToUserId !== null) {
      const member = (await db.select({ userId: tenantMembers.userId, name: users.name }).from(tenantMembers).innerJoin(users, eq(users.id, tenantMembers.userId)).where(and(eq(tenantMembers.tenantId, input.tenantId), eq(tenantMembers.userId, input.assignedToUserId), eq(tenantMembers.active, true))).limit(1))[0];
      if (!member) throw new TRPCError({ code: "BAD_REQUEST", message: "O responsável precisa pertencer a esta oficina." });
      assignedUserName = member.name;
    }
    await db.transaction(async tx => {
      await tx.update(quoteRequests).set({ status: input.status, assignedToUserId: input.assignedToUserId === undefined ? request.assignedToUserId : input.assignedToUserId }).where(and(eq(quoteRequests.id, request.id), eq(quoteRequests.tenantId, input.tenantId)));
      if (request.status !== input.status) await tx.insert(quoteRequestEvents).values({ tenantId: input.tenantId, quoteRequestId: request.id, type: "status_changed", actorUserId: ctx.user.id, metadata: { from: request.status, to: input.status } });
      if (input.assignedToUserId !== undefined && input.assignedToUserId !== request.assignedToUserId) await tx.insert(quoteRequestEvents).values({ tenantId: input.tenantId, quoteRequestId: request.id, type: "assigned", actorUserId: ctx.user.id, metadata: { assignedToUserId: input.assignedToUserId, assignedToUserName: assignedUserName } });
      if (input.note) await tx.insert(quoteRequestEvents).values({ tenantId: input.tenantId, quoteRequestId: request.id, type: "note_added", actorUserId: ctx.user.id, metadata: { note: input.note } });
    });
    await writeAuditLog({ tenantId: input.tenantId, actorUserId: ctx.user.id, action: "quote_request.updated", entityType: "quote_request", entityId: request.id, before: { status: request.status, assignedToUserId: request.assignedToUserId }, after: { status: input.status, assignedToUserId: input.assignedToUserId ?? request.assignedToUserId } });
    return { success: true };
  }),

  history: protectedProcedure.input(tenantIdInput.extend({ quoteRequestId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    await requireTenantPermission(ctx.user, input.tenantId, "quotes.manage");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
    return db.select().from(quoteRequestEvents).where(and(eq(quoteRequestEvents.tenantId, input.tenantId), eq(quoteRequestEvents.quoteRequestId, input.quoteRequestId))).orderBy(desc(quoteRequestEvents.createdAt));
  }),

  suggestion: protectedProcedure.input(tenantIdInput.extend({ quoteRequestId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const access = await requireTenantPermission(ctx.user, input.tenantId, "quotes.manage");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
    const request = (await db.select().from(quoteRequests).where(and(eq(quoteRequests.id, input.quoteRequestId), eq(quoteRequests.tenantId, input.tenantId))).limit(1))[0];
    if (!request?.serviceId) throw new TRPCError({ code: "BAD_REQUEST", message: "Esta solicitação precisa ser associada a um serviço antes da sugestão." });
    const items = await buildSuggestion(input.tenantId, request.serviceId);
    const total = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const totalCost = items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
    const financial = hasPermission(access, "financial.view");
    return { request, items: financial ? items : items.map(({ unitCost, ...safe }) => safe), total, ...(financial ? { totalCost, marginPercent: total ? ((total - totalCost) / total) * 100 : 0 } : {}) };
  }),
});

export const quoteRouter = router({
  createFromSuggestion: protectedProcedure.input(tenantIdInput.extend({ quoteRequestId: z.number().int().positive(), notes: z.string().max(4000).optional(), terms: z.string().max(4000).optional(), validUntil: z.date().optional() })).mutation(async ({ ctx, input }) => {
    await requireTenantPermission(ctx.user, input.tenantId, "quotes.manage");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
    const request = (await db.select().from(quoteRequests).where(and(eq(quoteRequests.id, input.quoteRequestId), eq(quoteRequests.tenantId, input.tenantId))).limit(1))[0];
    if (!request?.serviceId || !request.customerId || !request.vehicleId) throw new TRPCError({ code: "BAD_REQUEST", message: "Solicitação incompleta para gerar orçamento." });
    const serviceId = request.serviceId;
    const customerId = request.customerId;
    const vehicleId = request.vehicleId;
    const suggested = await buildSuggestion(input.tenantId, serviceId);
    const setting = (await db.select().from(tenantSettings).where(eq(tenantSettings.tenantId, input.tenantId)).limit(1))[0];
    const validUntil = input.validUntil ?? new Date(Date.now() + (setting?.quoteValidityDays ?? 7) * 24 * 60 * 60 * 1000);
    if (validUntil.getTime() <= Date.now()) throw new TRPCError({ code: "BAD_REQUEST", message: "A validade precisa estar no futuro." });
    const subtotal = suggested.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const estimatedCostTotal = suggested.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
    const output = await db.transaction(async (tx) => {
      const next = (await tx.select({ value: sql<number>`coalesce(max(${quotes.number}), 0) + 1` }).from(quotes).where(eq(quotes.tenantId, input.tenantId)))[0]?.value ?? 1;
      const token = nanoid(48);
      const quoteValues: typeof quotes.$inferInsert = { tenantId: input.tenantId, number: Number(next), quoteRequestId: request.id, customerId, vehicleId, status: "ready", subtotal: subtotal.toFixed(2), total: subtotal.toFixed(2), estimatedCostTotal: estimatedCostTotal.toFixed(2), estimatedMarginPercent: (subtotal ? ((subtotal - estimatedCostTotal) / subtotal) * 100 : 0).toFixed(2), validUntil, publicToken: token, publicTokenExpiresAt: validUntil, notes: input.notes ?? null, terms: input.terms ?? null, createdByUserId: ctx.user.id };
      const quote = await tx.insert(quotes).values(quoteValues);
      const quoteId = Number(quote[0].insertId);
      await tx.insert(quoteItems).values(suggested.map((item, sortOrder) => ({ tenantId: input.tenantId, quoteId, productId: item.productId ?? null, serviceId: item.serviceId ?? null, itemType: item.itemType, description: item.description, quantity: item.quantity.toFixed(3), unitPrice: item.unitPrice.toFixed(2), unitCost: item.unitCost.toFixed(2), sortOrder })));
      await tx.insert(quoteEvents).values({ tenantId: input.tenantId, quoteId, type: "created", actorUserId: ctx.user.id });
      await tx.update(quoteRequests).set({ status: "ready", assignedToUserId: ctx.user.id }).where(and(eq(quoteRequests.id, request.id), eq(quoteRequests.tenantId, input.tenantId)));
      await tx.insert(quoteRequestEvents).values({ tenantId: input.tenantId, quoteRequestId: request.id, type: "quote_created", actorUserId: ctx.user.id, metadata: { quoteId } });
      return { id: quoteId, number: Number(next), publicToken: token };
    });
    await writeAuditLog({ tenantId: input.tenantId, actorUserId: ctx.user.id, action: "quote.created", entityType: "quote", entityId: output.id, after: { number: output.number, requestId: request.id } });
    return output;
  }),

  send: protectedProcedure.input(tenantIdInput.extend({ quoteId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    await requireTenantPermission(ctx.user, input.tenantId, "quotes.manage");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
    const quote = (await db.select({ quote: quotes, customer: customers, vehicle: vehicles }).from(quotes).innerJoin(customers, and(eq(customers.id, quotes.customerId), eq(customers.tenantId, quotes.tenantId))).innerJoin(vehicles, and(eq(vehicles.id, quotes.vehicleId), eq(vehicles.tenantId, quotes.tenantId))).where(and(eq(quotes.id, input.quoteId), eq(quotes.tenantId, input.tenantId))).limit(1))[0];
    if (!quote || !isQuoteTransitionAllowed(quote.quote.status, "sent")) throw new TRPCError({ code: "BAD_REQUEST", message: "Este orçamento não pode ser enviado." });
    await db.transaction(async (tx) => {
      await tx.update(quotes).set({ status: "sent", sentAt: new Date() }).where(and(eq(quotes.id, input.quoteId), eq(quotes.tenantId, input.tenantId)));
      await tx.insert(quoteEvents).values({ tenantId: input.tenantId, quoteId: input.quoteId, type: "sent", actorUserId: ctx.user.id });
      if (quote.quote.quoteRequestId) await tx.update(quoteRequests).set({ status: "sent" }).where(and(eq(quoteRequests.id, quote.quote.quoteRequestId), eq(quoteRequests.tenantId, input.tenantId)));
    });
    await writeAuditLog({ tenantId: input.tenantId, actorUserId: ctx.user.id, action: "quote.sent", entityType: "quote", entityId: input.quoteId, metadata: { channel: "manual_whatsapp_preparation" } });
    const publicUrl = `/orcamento/${quote.quote.publicToken}`;
    const [settings, tenant] = await Promise.all([
      db.select({ quoteMessageTemplate: tenantSettings.quoteMessageTemplate }).from(tenantSettings).where(eq(tenantSettings.tenantId, input.tenantId)).limit(1),
      db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, input.tenantId)).limit(1),
    ]);
    return { preparedMessage: renderQuoteMessage(settings[0]?.quoteMessageTemplate, { client: quote.customer.name, vehicle: `${quote.vehicle.make} ${quote.vehicle.model}`, total: `R$ ${Number(quote.quote.total).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, link: publicUrl, workshop: tenant[0]?.name ?? "Oficina" }), publicUrl };
  }),

  list: protectedProcedure.input(tenantIdInput.extend({ status: z.enum(["draft", "ready", "sent", "viewed", "approved", "rejected", "expired", "cancelled"]).optional() })).query(async ({ ctx, input }) => {
    const access = await requireTenantPermission(ctx.user, input.tenantId, "quotes.manage");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
    const rows = await db.select({ quote: quotes, customer: customers, vehicle: vehicles }).from(quotes).innerJoin(customers, and(eq(customers.id, quotes.customerId), eq(customers.tenantId, quotes.tenantId))).innerJoin(vehicles, and(eq(vehicles.id, quotes.vehicleId), eq(vehicles.tenantId, quotes.tenantId))).where(input.status ? and(eq(quotes.tenantId, input.tenantId), eq(quotes.status, input.status)) : eq(quotes.tenantId, input.tenantId)).orderBy(desc(quotes.createdAt));
    return rows.map(row => hasPermission(access, "financial.view") ? row : { ...row, quote: (({ estimatedCostTotal, estimatedMarginPercent, ...safe }) => safe)(row.quote) });
  }),

  detail: protectedProcedure.input(tenantIdInput.extend({ quoteId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const access = await requireTenantPermission(ctx.user, input.tenantId, "quotes.manage");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
    const quote = (await db.select().from(quotes).where(and(eq(quotes.id, input.quoteId), eq(quotes.tenantId, input.tenantId))).limit(1))[0];
    if (!quote) throw new TRPCError({ code: "NOT_FOUND", message: "Orçamento não encontrado nesta oficina." });
    const items = await db.select().from(quoteItems).where(and(eq(quoteItems.tenantId, input.tenantId), eq(quoteItems.quoteId, quote.id))).orderBy(asc(quoteItems.sortOrder));
    if (hasPermission(access, "financial.view")) return { quote, items };
    const { estimatedCostTotal, estimatedMarginPercent, ...safeQuote } = quote;
    return { quote: safeQuote, items: items.map(({ unitCost, ...safe }) => safe) };
  }),

  applyDiscounts: protectedProcedure.input(tenantIdInput.extend({
    quoteId: z.number().int().positive(),
    items: z.array(z.object({ quoteItemId: z.number().int().positive(), discount: z.coerce.number().finite().nonnegative() })).min(1).max(100),
    overrideReason: z.string().trim().min(3).max(1000).optional(),
  })).mutation(async ({ ctx, input }) => {
    const access = await requireTenantPermission(ctx.user, input.tenantId, "quotes.manage");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
    const quote = (await db.select().from(quotes).where(and(eq(quotes.id, input.quoteId), eq(quotes.tenantId, input.tenantId))).limit(1))[0];
    if (!quote) throw new TRPCError({ code: "NOT_FOUND", message: "Orçamento não encontrado nesta oficina." });
    if (!["draft", "ready"].includes(quote.status)) throw new TRPCError({ code: "BAD_REQUEST", message: "Descontos só podem ser ajustados antes do envio ao cliente." });
    const savedItems = await db.select().from(quoteItems).where(and(eq(quoteItems.tenantId, input.tenantId), eq(quoteItems.quoteId, quote.id))).orderBy(asc(quoteItems.sortOrder));
    const discounts = new Map<number, number>();
    for (const item of input.items) {
      if (discounts.has(item.quoteItemId)) throw new TRPCError({ code: "BAD_REQUEST", message: "Cada item pode receber apenas um desconto por atualização." });
      discounts.set(item.quoteItemId, item.discount);
    }
    if (discounts.size !== savedItems.length || savedItems.some(item => !discounts.has(item.id))) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe o desconto de todos os itens do orçamento." });
    const lines = savedItems.map(item => {
      const discount = discounts.get(item.id) ?? 0;
      const gross = Number(item.quantity) * Number(item.unitPrice);
      if (discount > gross) throw new TRPCError({ code: "BAD_REQUEST", message: `O desconto de ${item.description} não pode superar o valor do item.` });
      return { quantity: Number(item.quantity), unitPrice: Number(item.unitPrice), unitCost: Number(item.unitCost), discount };
    });
    const pricing = calculateQuotePricing(lines);
    const settings = (await db.select().from(tenantSettings).where(eq(tenantSettings.tenantId, input.tenantId)).limit(1))[0];
    const financialManager = hasPermission(access, "financial.manage");
    const minimumMargin = Number(settings?.minimumMarginPercent ?? 0);
    const violation = discountPolicyViolation({ pricing, attendantMaxDiscountPercent: Number(settings?.attendantMaxDiscountPercent ?? 0), minimumMarginPercent: minimumMargin, canManageFinancials: financialManager, overrideReason: input.overrideReason });
    if (violation === "discount_limit") throw new TRPCError({ code: "FORBIDDEN", message: "O desconto solicitado ultrapassa o limite permitido para seu perfil." });
    if (violation === "minimum_margin") throw new TRPCError({ code: "BAD_REQUEST", message: `A margem estimada ficaria abaixo do mínimo de ${minimumMargin.toFixed(2)}%. Um gestor financeiro deve informar uma justificativa para autorizar a exceção.` });
    await db.transaction(async tx => {
      for (const item of savedItems) await tx.update(quoteItems).set({ discount: (discounts.get(item.id) ?? 0).toFixed(2) }).where(and(eq(quoteItems.id, item.id), eq(quoteItems.tenantId, input.tenantId)));
      await tx.update(quotes).set({ subtotal: pricing.subtotal.toFixed(2), discountTotal: pricing.discountTotal.toFixed(2), total: pricing.total.toFixed(2), estimatedCostTotal: pricing.totalCost.toFixed(2), estimatedMarginPercent: pricing.marginPercent.toFixed(2) }).where(and(eq(quotes.id, quote.id), eq(quotes.tenantId, input.tenantId)));
    });
    await writeAuditLog({ tenantId: input.tenantId, actorUserId: ctx.user.id, action: "quote.discounts_updated", entityType: "quote", entityId: quote.id, before: { total: quote.total, discountTotal: quote.discountTotal, marginPercent: quote.estimatedMarginPercent }, after: { total: pricing.total, discountTotal: pricing.discountTotal, marginPercent: pricing.marginPercent, overrideReason: input.overrideReason ?? null } });
    return pricing;
  }),

  publicView: publicProcedure.input(z.object({ token: z.string().min(1).max(96) })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
    const row = (await db.select({ quote: quotes, customer: customers, vehicle: vehicles, tenant: tenants, branding: tenantBranding }).from(quotes).innerJoin(customers, and(eq(customers.id, quotes.customerId), eq(customers.tenantId, quotes.tenantId))).innerJoin(vehicles, and(eq(vehicles.id, quotes.vehicleId), eq(vehicles.tenantId, quotes.tenantId))).innerJoin(tenants, eq(tenants.id, quotes.tenantId)).leftJoin(tenantBranding, eq(tenantBranding.tenantId, tenants.id)).where(eq(quotes.publicToken, input.token)).limit(1))[0];
    if (!row || !row.tenant.active) return null;
    if (row.quote.publicTokenExpiresAt.getTime() < Date.now() && isQuoteTransitionAllowed(row.quote.status, "expired")) {
      await db.update(quotes).set({ status: "expired" }).where(and(eq(quotes.id, row.quote.id), eq(quotes.tenantId, row.quote.tenantId)));
      return { expired: true as const };
    }
    if (row.quote.status === "expired") return { expired: true as const };
    const items = await db.select().from(quoteItems).where(and(eq(quoteItems.quoteId, row.quote.id), eq(quoteItems.tenantId, row.quote.tenantId))).orderBy(asc(quoteItems.sortOrder));
    if (!row.quote.viewedAt && isQuoteTransitionAllowed(row.quote.status, "viewed")) {
      await db.transaction(async (tx) => {
        await tx.update(quotes).set({ status: "viewed", viewedAt: new Date() }).where(and(eq(quotes.id, row.quote.id), eq(quotes.tenantId, row.quote.tenantId)));
        await tx.insert(quoteEvents).values({ tenantId: row.quote.tenantId, quoteId: row.quote.id, type: "viewed" });
      });
    }
    return { workshop: { name: row.tenant.name, whatsapp: null, branding: row.branding }, quote: { number: row.quote.number, status: row.quote.status, total: Number(row.quote.total), validUntil: row.quote.validUntil, notes: row.quote.notes, terms: row.quote.terms }, customer: { name: row.customer.name }, vehicle: { make: row.vehicle.make, model: row.vehicle.model, modelYear: row.vehicle.modelYear }, items: publicQuoteItems(items) };
  }),

  publicDecision: publicProcedure.input(z.object({ token: z.string().min(1).max(96), decision: z.enum(["approved", "rejected"]) })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
    const quote = (await db.select().from(quotes).where(eq(quotes.publicToken, input.token)).limit(1))[0];
    if (!quote) throw new TRPCError({ code: "NOT_FOUND", message: "Orçamento não encontrado." });
    if (quote.publicTokenExpiresAt.getTime() < Date.now()) throw new TRPCError({ code: "BAD_REQUEST", message: "Este link de orçamento expirou." });
    if (quote.status === "approved" || quote.status === "rejected") return { status: quote.status, idempotent: true };
    if (!isQuoteTransitionAllowed(quote.status, input.decision)) throw new TRPCError({ code: "BAD_REQUEST", message: "Este orçamento não está disponível para decisão." });
    await db.transaction(async (tx) => {
      if (input.decision === "rejected") {
        await tx.update(quotes).set({ status: "rejected", rejectedAt: new Date() }).where(and(eq(quotes.id, quote.id), eq(quotes.tenantId, quote.tenantId)));
        await tx.insert(quoteEvents).values({ tenantId: quote.tenantId, quoteId: quote.id, type: "rejected", metadata: { source: "public_link" } });
        if (quote.quoteRequestId) await tx.update(quoteRequests).set({ status: "rejected" }).where(and(eq(quoteRequests.id, quote.quoteRequestId), eq(quoteRequests.tenantId, quote.tenantId)));
        return;
      }
      const productItems = await tx.select().from(quoteItems).where(and(eq(quoteItems.tenantId, quote.tenantId), eq(quoteItems.quoteId, quote.id), eq(quoteItems.itemType, "product")));
      const productIds = productItems.flatMap(item => item.productId ? [item.productId] : []);
      const balances = productIds.length ? await tx.select().from(inventoryBalances).where(and(eq(inventoryBalances.tenantId, quote.tenantId), inArray(inventoryBalances.productId, productIds))) : [];
      const plan = buildReservationPlan(productItems, balances);
      if (plan.some(item => !item.reservable)) throw new TRPCError({ code: "CONFLICT", message: "Um ou mais itens não possuem disponibilidade para reserva. Fale com a oficina." });
      for (const item of plan) {
        const balance = balances.find(candidate => candidate.productId === item.productId)!;
        await tx.insert(inventoryReservations).values({ tenantId: quote.tenantId, productId: item.productId, quoteId: quote.id, quantity: item.quantity.toFixed(3) });
        await tx.update(inventoryBalances).set({ reservedQuantity: sql`${inventoryBalances.reservedQuantity} + ${item.quantity.toFixed(3)}` }).where(and(eq(inventoryBalances.id, balance.id), eq(inventoryBalances.tenantId, quote.tenantId)));
        await tx.insert(inventoryMovements).values({ tenantId: quote.tenantId, productId: item.productId, type: "reservation", quantity: item.quantity.toFixed(3), physicalDelta: "0", reservedDelta: item.quantity.toFixed(3), referenceType: "quote", referenceId: quote.id, notes: "Reserva criada por aprovação do orçamento." });
      }
      await tx.update(quotes).set({ status: "approved", approvedAt: new Date() }).where(and(eq(quotes.id, quote.id), eq(quotes.tenantId, quote.tenantId)));
      await tx.insert(quoteEvents).values({ tenantId: quote.tenantId, quoteId: quote.id, type: "approved", metadata: { source: "public_link" } });
      if (quote.quoteRequestId) await tx.update(quoteRequests).set({ status: "approved" }).where(and(eq(quoteRequests.id, quote.quoteRequestId), eq(quoteRequests.tenantId, quote.tenantId)));
    });
    await writeAuditLog({ tenantId: quote.tenantId, action: `quote.${input.decision}_public`, entityType: "quote", entityId: quote.id, metadata: { source: "public_link" } });
    return { status: input.decision, idempotent: false };
  }),
});
