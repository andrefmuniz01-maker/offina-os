import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  auditLogs,
  tenantBranding,
  tenantMembers,
  tenantSettings,
  tenants,
  type InsertUser,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let database: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!database && process.env.DATABASE_URL) {
    try {
      database = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Falha ao conectar:", error);
      database = null;
    }
  }
  return database;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId, lastSignedIn: user.lastSignedIn ?? new Date() };
  const updateSet: Record<string, unknown> = { lastSignedIn: values.lastSignedIn };
  for (const field of ["name", "email", "loginMethod"] as const) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  values.role = user.role ?? (user.openId === ENV.ownerOpenId ? "admin" : "user");
  values.platformRole = user.platformRole ?? (user.openId === ENV.ownerOpenId ? "super_admin" : "platform_user");
  updateSet.role = values.role;
  updateSet.platformRole = values.platformRole;

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  return (await db.select().from(users).where(eq(users.openId, openId)).limit(1))[0];
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  return (await db.select().from(users).where(eq(users.email, email)).limit(1))[0];
}

export async function listUserTenants(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ tenant: tenants, membership: tenantMembers })
    .from(tenantMembers)
    .innerJoin(tenants, eq(tenantMembers.tenantId, tenants.id))
    .where(and(eq(tenantMembers.userId, userId), eq(tenantMembers.active, true), eq(tenants.active, true)));
}

export async function createTenantForOwner(input: {
  ownerUserId: number;
  actorUserId: number;
  name: string;
  slug: string;
  whatsapp?: string;
  primaryColor?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  return db.transaction(async (tx) => {
    const result = await tx.insert(tenants).values({
      name: input.name,
      slug: input.slug,
      status: "active",
      primaryOwnerUserId: input.ownerUserId,
    });
    const tenantId = Number(result[0].insertId);
    await tx.insert(tenantSettings).values({ tenantId, whatsapp: input.whatsapp ?? null });
    await tx.insert(tenantBranding).values({ tenantId, publicTitle: input.name, primaryColor: input.primaryColor ?? "#E84D1C" });
    await tx.insert(tenantMembers).values({ tenantId, userId: input.ownerUserId, role: "owner" });
    await tx.insert(auditLogs).values({
      tenantId,
      actorUserId: input.actorUserId,
      action: "tenant.created",
      entityType: "tenant",
      entityId: tenantId,
      after: { name: input.name, slug: input.slug },
    });
    return tenantId;
  });
}

export async function writeAuditLog(input: {
  tenantId?: number | null;
  actorUserId?: number | null;
  action: string;
  entityType: string;
  entityId?: number | null;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(auditLogs).values({
    tenantId: input.tenantId ?? null,
    actorUserId: input.actorUserId ?? null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    before: input.before,
    after: input.after,
    metadata: input.metadata,
  });
}

export async function countTenantRows(table: typeof tenants, tenantId: number) {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select({ count: sql<number>`count(*)` }).from(table).where(eq(table.id, tenantId));
  return Number(result[0]?.count ?? 0);
}
