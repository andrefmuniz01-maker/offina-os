import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { auditLogs, tenantBranding, tenantMembers, tenants, users } from "../../drizzle/schema";
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
      await db.update(tenantBranding).set(changes).where(eq(tenantBranding.tenantId, tenantId));
      await writeAuditLog({ tenantId, actorUserId: ctx.user.id, action: "tenant.branding_updated", entityType: "tenant_branding", after: changes });
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
      await db.insert(tenantMembers).values({ tenantId: input.tenantId, userId: target.id, role: input.role })
        .onDuplicateKeyUpdate({ set: { role: input.role, active: true } });
      await writeAuditLog({ tenantId: input.tenantId, actorUserId: ctx.user.id, action: "tenant.member_added", entityType: "tenant_member", entityId: target.id, after: { role: input.role } });
      return { success: true };
    }),
    updateRole: protectedProcedure.input(tenantIdInput.extend({ userId: z.number().int().positive(), role: roleInput, active: z.boolean().optional() }))
      .mutation(async ({ ctx, input }) => {
        await requireTenantPermission(ctx.user, input.tenantId, "team.manage");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
        const result = await db.update(tenantMembers).set({ role: input.role, ...(input.active === undefined ? {} : { active: input.active }) })
          .where(and(eq(tenantMembers.tenantId, input.tenantId), eq(tenantMembers.userId, input.userId)));
        if (!result[0].affectedRows) throw new TRPCError({ code: "NOT_FOUND", message: "Vínculo de usuário não encontrado nesta oficina." });
        await writeAuditLog({ tenantId: input.tenantId, actorUserId: ctx.user.id, action: "tenant.member_updated", entityType: "tenant_member", entityId: input.userId, after: { role: input.role, active: input.active } });
        return { success: true };
      }),
  }),

  audit: router({
    list: protectedProcedure.input(tenantIdInput.extend({ limit: z.number().int().min(1).max(100).default(30) })).query(async ({ ctx, input }) => {
      await requireTenantPermission(ctx.user, input.tenantId, "tenant.manage");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
      return db.select().from(auditLogs).where(eq(auditLogs.tenantId, input.tenantId)).orderBy(desc(auditLogs.createdAt)).limit(input.limit);
    }),
  }),
});
