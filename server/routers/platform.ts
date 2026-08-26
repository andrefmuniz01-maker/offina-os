import { and, count, desc, eq, isNull, like, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { auditLogs, customers, plans, tenantBranding, tenantMembers, tenantSettings, tenants, users } from "../../drizzle/schema";
import { createTenantForOwner, getDb, listUserTenants, writeAuditLog } from "../db";
import { assertPlatformSuperAdmin, getTenantAccess, requireTenantPermission } from "../tenantAccess";
import { protectedProcedure, router } from "../_core/trpc";

const tenantIdInput = z.object({ tenantId: z.number().int().positive() });
const roleInput = z.enum(["owner", "admin", "attendant", "technician"]);

export const platformRouter = router({
  overview: protectedProcedure.query(async ({ ctx }) => {
    assertPlatformSuperAdmin(ctx.user);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
    return db.select().from(tenants).orderBy(desc(tenants.createdAt));
  }),

  metrics: protectedProcedure.query(async ({ ctx }) => {
    assertPlatformSuperAdmin(ctx.user);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
    const [tenantCount, activeCount, userCount, memberships] = await Promise.all([
      db.select({ total: count() }).from(tenants),
      db.select({ total: count() }).from(tenants).where(and(eq(tenants.active, true), eq(tenants.status, "active"))),
      db.select({ total: count() }).from(users),
      db.select({ total: count() }).from(tenantMembers).where(eq(tenantMembers.active, true)),
    ]);
    return { tenants: Number(tenantCount[0]?.total ?? 0), activeTenants: Number(activeCount[0]?.total ?? 0), users: Number(userCount[0]?.total ?? 0), activeMemberships: Number(memberships[0]?.total ?? 0) };
  }),

  usage: protectedProcedure.query(async ({ ctx }) => {
    assertPlatformSuperAdmin(ctx.user);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
    const [tenantRows, memberRows, customerRows] = await Promise.all([
      db.select({ tenant: tenants, plan: plans }).from(tenants).leftJoin(plans, eq(plans.id, tenants.planId)).orderBy(desc(tenants.createdAt)),
      db.select({ tenantId: tenantMembers.tenantId, total: count() }).from(tenantMembers).where(eq(tenantMembers.active, true)).groupBy(tenantMembers.tenantId),
      db.select({ tenantId: customers.tenantId, total: count() }).from(customers).groupBy(customers.tenantId),
    ]);
    const members = new Map(memberRows.map(row => [row.tenantId, Number(row.total)]));
    const customersByTenant = new Map(customerRows.map(row => [row.tenantId, Number(row.total)]));
    return tenantRows.map(({ tenant, plan }) => ({
      tenantId: tenant.id,
      memberCount: members.get(tenant.id) ?? 0,
      customerCount: customersByTenant.get(tenant.id) ?? 0,
      plan: plan ? { id: plan.id, name: plan.name, maxUsers: plan.maxUsers, maxCustomers: plan.maxCustomers, active: plan.active } : null,
    }));
  }),

  updateTenant: protectedProcedure.input(z.object({ tenantId: z.number().int().positive(), status: z.enum(["trial", "active", "suspended", "inactive"]).optional(), active: z.boolean().optional(), planId: z.number().int().positive().nullable().optional() })).mutation(async ({ ctx, input }) => {
    assertPlatformSuperAdmin(ctx.user);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
    const { tenantId, ...changes } = input;
    const tenant = (await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1))[0];
    if (!tenant) throw new TRPCError({ code: "NOT_FOUND", message: "Oficina não encontrada." });
    if (changes.planId) {
      const plan = (await db.select({ id: plans.id }).from(plans).where(and(eq(plans.id, changes.planId), eq(plans.active, true))).limit(1))[0];
      if (!plan) throw new TRPCError({ code: "BAD_REQUEST", message: "Plano indisponível." });
    }
    const updateConditions = [eq(tenants.id, tenantId)];
    if (changes.status !== undefined) updateConditions.push(eq(tenants.status, tenant.status));
    if (changes.active !== undefined) updateConditions.push(eq(tenants.active, tenant.active));
    if (changes.planId !== undefined) updateConditions.push(tenant.planId === null ? isNull(tenants.planId) : eq(tenants.planId, tenant.planId));
    const updated = await db.update(tenants).set(changes).where(and(...updateConditions));
    if (!Number(updated[0]?.affectedRows ?? 0)) throw new TRPCError({ code: "CONFLICT", message: "Este tenant foi alterado em outra sessão. Atualize o painel para consultar o estado atual." });
    await writeAuditLog({ tenantId, actorUserId: ctx.user.id, action: "platform.tenant_updated", entityType: "tenant", entityId: tenantId, before: { status: tenant.status, active: tenant.active, planId: tenant.planId }, after: changes });
    return { success: true };
  }),

  createTenant: protectedProcedure.input(z.object({
    name: z.string().trim().min(3).max(160),
    slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use apenas letras minúsculas, números e hífens."),
    ownerUserId: z.number().int().positive().optional(),
    whatsapp: z.string().trim().max(32).optional(),
    primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  })).mutation(async ({ ctx, input }) => {
    assertPlatformSuperAdmin(ctx.user);
    const ownerUserId = input.ownerUserId ?? ctx.user.id;
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
    const owner = (await db.select({ id: users.id }).from(users).where(eq(users.id, ownerUserId)).limit(1))[0];
    if (!owner) throw new TRPCError({ code: "NOT_FOUND", message: "O administrador informado ainda não possui acesso à plataforma." });

    const existing = (await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, input.slug)).limit(1))[0];
    if (existing) throw new TRPCError({ code: "CONFLICT", message: "Este identificador de oficina já está em uso." });

    const tenantId = await createTenantForOwner({ ...input, ownerUserId, actorUserId: ctx.user.id });
    return { tenantId };
  }),

  plans: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      assertPlatformSuperAdmin(ctx.user);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
      return db.select().from(plans).orderBy(desc(plans.createdAt));
    }),
    create: protectedProcedure.input(z.object({
      code: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use apenas letras minúsculas, números e hífens."),
      name: z.string().trim().min(2).max(128),
      description: z.string().trim().max(2000).nullable().optional(),
      maxUsers: z.number().int().min(1).max(100_000),
      maxCustomers: z.number().int().min(1).max(10_000_000).nullable().optional(),
      active: z.boolean().default(true),
    })).mutation(async ({ ctx, input }) => {
      assertPlatformSuperAdmin(ctx.user);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
      const existing = (await db.select({ id: plans.id }).from(plans).where(eq(plans.code, input.code)).limit(1))[0];
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "Este código de plano já está em uso." });
      const result = await db.insert(plans).values({ code: input.code, name: input.name, description: input.description ?? null, maxUsers: input.maxUsers, maxCustomers: input.maxCustomers ?? null, active: input.active });
      const planId = Number(result[0].insertId);
      await writeAuditLog({ actorUserId: ctx.user.id, action: "platform.plan_created", entityType: "plan", entityId: planId, after: { code: input.code, name: input.name, maxUsers: input.maxUsers, maxCustomers: input.maxCustomers ?? null, active: input.active } });
      return { id: planId };
    }),
    update: protectedProcedure.input(z.object({
      planId: z.number().int().positive(),
      name: z.string().trim().min(2).max(128).optional(),
      description: z.string().trim().max(2000).nullable().optional(),
      maxUsers: z.number().int().min(1).max(100_000).optional(),
      maxCustomers: z.number().int().min(1).max(10_000_000).nullable().optional(),
      active: z.boolean().optional(),
    }).refine(input => input.name !== undefined || input.description !== undefined || input.maxUsers !== undefined || input.maxCustomers !== undefined || input.active !== undefined, "Informe ao menos uma alteração."))
      .mutation(async ({ ctx, input }) => {
        assertPlatformSuperAdmin(ctx.user);
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
        const plan = (await db.select().from(plans).where(eq(plans.id, input.planId)).limit(1))[0];
        if (!plan) throw new TRPCError({ code: "NOT_FOUND", message: "Plano não encontrado." });
        const { planId, ...changes } = input;
        const result = await db.update(plans).set(changes).where(and(eq(plans.id, planId), eq(plans.updatedAt, plan.updatedAt)));
        if (!Number(result[0]?.affectedRows ?? 0)) throw new TRPCError({ code: "CONFLICT", message: "Este plano foi alterado em outra sessão. Atualize o painel para consultar o estado atual." });
        await writeAuditLog({ actorUserId: ctx.user.id, action: "platform.plan_updated", entityType: "plan", entityId: planId, before: { name: plan.name, description: plan.description, maxUsers: plan.maxUsers, maxCustomers: plan.maxCustomers, active: plan.active }, after: changes });
        return { success: true };
      }),
  }),
});

export const tenantRouter = router({
  mine: protectedProcedure.query(({ ctx }) => listUserTenants(ctx.user.id)),

  access: protectedProcedure.input(tenantIdInput).query(({ ctx, input }) => getTenantAccess(ctx.user, input.tenantId)),

  branding: router({
    get: protectedProcedure.input(tenantIdInput).query(async ({ ctx, input }) => {
      await getTenantAccess(ctx.user, input.tenantId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
      return (await db.select().from(tenantBranding).where(eq(tenantBranding.tenantId, input.tenantId)).limit(1))[0] ?? null;
    }),
    update: protectedProcedure.input(tenantIdInput.extend({
      logoUrl: z.string().url().nullable().optional(),
      primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      publicTitle: z.string().trim().min(3).max(160).nullable().optional(),
    })).mutation(async ({ ctx, input }) => {
      await requireTenantPermission(ctx.user, input.tenantId, "tenant.manage");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
      const { tenantId, ...changes } = input;
      const previous = (await db.select().from(tenantBranding).where(eq(tenantBranding.tenantId, tenantId)).limit(1))[0] ?? null;
      const before = previous ? Object.fromEntries(Object.keys(changes).map(key => [key, (previous as unknown as Record<string, unknown>)[key]])) : undefined;
      await db.insert(tenantBranding).values({ tenantId, ...changes }).onDuplicateKeyUpdate({ set: changes });
      await writeAuditLog({ tenantId, actorUserId: ctx.user.id, action: "tenant.branding_updated", entityType: "tenant_branding", before, after: changes });
      return { success: true };
    }),
  }),

  settings: router({
    get: protectedProcedure.input(tenantIdInput).query(async ({ ctx, input }) => {
      await requireTenantPermission(ctx.user, input.tenantId, "tenant.manage");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
      return (await db.select().from(tenantSettings).where(eq(tenantSettings.tenantId, input.tenantId)).limit(1))[0] ?? null;
    }),
    update: protectedProcedure.input(tenantIdInput.extend({ legalName: z.string().trim().max(200).nullable().optional(), document: z.string().trim().max(32).nullable().optional(), phone: z.string().trim().max(32).nullable().optional(), whatsapp: z.string().trim().max(32).nullable().optional(), email: z.string().email().nullable().optional(), defaultLaborHourlyRate: z.coerce.number().min(0).max(1_000_000).optional(), defaultPartsMarginPercent: z.coerce.number().min(0).max(99.99).optional(), defaultPartsMarkupPercent: z.coerce.number().min(0).max(1_000).optional(), minimumMarginPercent: z.coerce.number().min(0).max(99.99).optional(), attendantMaxDiscountPercent: z.coerce.number().min(0).max(100).optional(), quoteValidityDays: z.number().int().min(1).max(365).optional(), quoteMessageTemplate: z.string().trim().max(2000).nullable().optional() })).mutation(async ({ ctx, input }) => {
      await requireTenantPermission(ctx.user, input.tenantId, "tenant.manage");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
      const { tenantId, defaultLaborHourlyRate, defaultPartsMarginPercent, defaultPartsMarkupPercent, minimumMarginPercent, attendantMaxDiscountPercent, ...rest } = input;
      const changes = { ...rest, ...(defaultLaborHourlyRate === undefined ? {} : { defaultLaborHourlyRate: defaultLaborHourlyRate.toFixed(2) }), ...(defaultPartsMarginPercent === undefined ? {} : { defaultPartsMarginPercent: defaultPartsMarginPercent.toFixed(2) }), ...(defaultPartsMarkupPercent === undefined ? {} : { defaultPartsMarkupPercent: defaultPartsMarkupPercent.toFixed(2) }), ...(minimumMarginPercent === undefined ? {} : { minimumMarginPercent: minimumMarginPercent.toFixed(2) }), ...(attendantMaxDiscountPercent === undefined ? {} : { attendantMaxDiscountPercent: attendantMaxDiscountPercent.toFixed(2) }) };
      const previous = (await db.select().from(tenantSettings).where(eq(tenantSettings.tenantId, tenantId)).limit(1))[0] ?? null;
      const before = previous ? Object.fromEntries(Object.keys(changes).map(key => [key, (previous as unknown as Record<string, unknown>)[key]])) : undefined;
      await db.insert(tenantSettings).values({ tenantId, ...changes }).onDuplicateKeyUpdate({ set: changes });
      await writeAuditLog({ tenantId, actorUserId: ctx.user.id, action: "tenant.settings_updated", entityType: "tenant_settings", before, after: changes });
      return { success: true };
    }),
  }),

  members: router({
    list: protectedProcedure.input(tenantIdInput).query(async ({ ctx, input }) => {
      await requireTenantPermission(ctx.user, input.tenantId, "team.manage");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
      return db.select({ member: tenantMembers, user: users })
        .from(tenantMembers)
        .innerJoin(users, eq(tenantMembers.userId, users.id))
        .where(eq(tenantMembers.tenantId, input.tenantId));
    }),
    addExistingUser: protectedProcedure.input(tenantIdInput.extend({
      email: z.string().email(),
      role: roleInput,
    })).mutation(async ({ ctx, input }) => {
      await requireTenantPermission(ctx.user, input.tenantId, "team.manage");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
      const target = (await db.select().from(users).where(eq(users.email, input.email)).limit(1))[0];
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Este usuário precisa acessar a plataforma uma vez antes de ser adicionado." });
      const previous = (await db.select({ role: tenantMembers.role, active: tenantMembers.active }).from(tenantMembers)
        .where(and(eq(tenantMembers.tenantId, input.tenantId), eq(tenantMembers.userId, target.id))).limit(1))[0] ?? null;
      await db.insert(tenantMembers).values({ tenantId: input.tenantId, userId: target.id, role: input.role })
        .onDuplicateKeyUpdate({ set: { role: input.role, active: true } });
      await writeAuditLog({ tenantId: input.tenantId, actorUserId: ctx.user.id, action: "tenant.member_added", entityType: "tenant_member", entityId: target.id, before: previous ? { role: previous.role, active: previous.active } : undefined, after: { role: input.role, active: true } });
      return { success: true };
    }),
    updateRole: protectedProcedure.input(tenantIdInput.extend({ userId: z.number().int().positive(), role: roleInput, active: z.boolean().optional() }))
      .mutation(async ({ ctx, input }) => {
        await requireTenantPermission(ctx.user, input.tenantId, "team.manage");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
        const member = (await db.select({ role: tenantMembers.role, active: tenantMembers.active }).from(tenantMembers)
          .where(and(eq(tenantMembers.tenantId, input.tenantId), eq(tenantMembers.userId, input.userId))).limit(1))[0];
        if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "Vínculo de usuário não encontrado nesta oficina." });
        const result = await db.update(tenantMembers).set({ role: input.role, ...(input.active === undefined ? {} : { active: input.active }) })
          .where(and(eq(tenantMembers.tenantId, input.tenantId), eq(tenantMembers.userId, input.userId), eq(tenantMembers.role, member.role), eq(tenantMembers.active, member.active)));
        if (!result[0].affectedRows) throw new TRPCError({ code: "CONFLICT", message: "O papel ou a ativação deste membro foi alterado em outra sessão. Atualize a equipe para consultar o estado atual." });
        await writeAuditLog({ tenantId: input.tenantId, actorUserId: ctx.user.id, action: "tenant.member_updated", entityType: "tenant_member", entityId: input.userId, before: { role: member.role, active: member.active }, after: { role: input.role, active: input.active ?? member.active } });
        return { success: true };
      }),
  }),

  audit: router({
    list: protectedProcedure.input(tenantIdInput.extend({ search: z.string().trim().min(1).max(120).optional(), page: z.number().int().min(1).default(1), pageSize: z.number().int().min(1).max(100).default(30) })).query(async ({ ctx, input }) => {
      await requireTenantPermission(ctx.user, input.tenantId, "tenant.manage");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
      const search = input.search ? `%${input.search}%` : null;
      const rows = await db.select().from(auditLogs).where(and(eq(auditLogs.tenantId, input.tenantId), ...(search ? [or(like(auditLogs.action, search), like(auditLogs.entityType, search), sql`CAST(${auditLogs.entityId} AS CHAR) LIKE ${search}`)] : []))).orderBy(desc(auditLogs.createdAt)).limit(input.pageSize + 1).offset((input.page - 1) * input.pageSize);
      return { items: rows.slice(0, input.pageSize), page: input.page, pageSize: input.pageSize, hasMore: rows.length > input.pageSize };
    }),
  }),
});
