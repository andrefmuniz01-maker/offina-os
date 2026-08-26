import type { Request, Response } from "express";
import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { inventoryBalances, notifications, products, quoteRequests, scheduledTasks, tenantMembers, tenants } from "../drizzle/schema";
import { getDb } from "./db";
import { sdk } from "./_core/sdk";

async function notifyTenantRoles(tenantId: number, type: string, title: string, body: string, link: string) {
  const db = await getDb();
  if (!db) return 0;
  const recipients = await db.select({ userId: tenantMembers.userId }).from(tenantMembers)
    .where(and(eq(tenantMembers.tenantId, tenantId), eq(tenantMembers.active, true), inArray(tenantMembers.role, ["owner", "admin", "attendant"])));
  if (!recipients.length) return 0;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recent = await db.select({ id: notifications.id }).from(notifications)
    .where(and(eq(notifications.tenantId, tenantId), eq(notifications.type, type), gte(notifications.createdAt, since))).limit(1);
  if (recent.length) return 0;
  await db.insert(notifications).values(recipients.map(recipient => ({ tenantId, userId: recipient.userId, type, title, body, link })));
  return recipients.length;
}

export async function runOperationalScan(req: Request, res: Response) {
  try {
    const runner = await sdk.authenticateRequest(req);
    if (!runner.isCron || !runner.taskUid) return res.status(403).json({ error: "cron-only" });
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "database-unavailable" });
    const task = (await db.select().from(scheduledTasks).where(and(eq(scheduledTasks.scheduleCronTaskUid, runner.taskUid), eq(scheduledTasks.active, true))).limit(1))[0];
    if (!task) return res.json({ ok: true, skipped: "orphan-or-paused" });
    const tenantRows = task.tenantId ? (await db.select().from(tenants).where(and(eq(tenants.id, task.tenantId), eq(tenants.active, true)))) : await db.select().from(tenants).where(eq(tenants.active, true));
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const result = { tenants: tenantRows.length, inventoryAlerts: 0, commercialAlerts: 0 };
    for (const tenant of tenantRows) {
      const critical = await db.select({ count: sql<number>`count(*)` }).from(inventoryBalances)
        .innerJoin(products, eq(products.id, inventoryBalances.productId))
        .where(and(eq(inventoryBalances.tenantId, tenant.id), sql`${inventoryBalances.physicalQuantity} - ${inventoryBalances.reservedQuantity} <= ${products.minStock}`));
      if (Number(critical[0]?.count ?? 0) > 0) {
        result.inventoryAlerts += await notifyTenantRoles(tenant.id, "inventory.critical", "Estoque exige atenção", `${critical[0]?.count} item(ns) estão no nível crítico considerando reservas.`, "/estoque");
      }
      const stale = await db.select({ count: sql<number>`count(*)` }).from(quoteRequests)
        .where(and(eq(quoteRequests.tenantId, tenant.id), inArray(quoteRequests.status, ["sent", "ready"]), lt(quoteRequests.updatedAt, cutoff)));
      if (Number(stale[0]?.count ?? 0) > 0) {
        result.commercialAlerts += await notifyTenantRoles(tenant.id, "quotes.follow_up_suggested", "Follow-up sugerido", `${stale[0]?.count} solicitação(ões) aguardam retorno há mais de 48 horas. Nenhuma mensagem foi enviada automaticamente.`, "/orcamentos");
      }
    }
    await db.update(scheduledTasks).set({ lastRunAt: new Date() }).where(eq(scheduledTasks.id, task.id));
    return res.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return res.status(500).json({ error: message, timestamp: new Date().toISOString(), context: { url: req.originalUrl } });
  }
}
