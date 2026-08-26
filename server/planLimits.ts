import { TRPCError } from "@trpc/server";
import { and, count, eq, sql } from "drizzle-orm";
import { customers, plans, tenantMembers, tenants } from "../drizzle/schema";

type PlanLimitResource = "members" | "customers";

export async function withTenantPlanTransaction<T>(db: any, operation: (tx: any) => Promise<T>) {
  return typeof db.transaction === "function" ? db.transaction(operation) : operation(db);
}

export async function assertTenantPlanCapacity(db: any, tenantId: number, resource: PlanLimitResource) {
  // Serializa admissões concorrentes do mesmo tenant antes de contar e inserir.
  if (typeof db.execute === "function") await db.execute(sql`SELECT ${tenants.id} FROM ${tenants} WHERE ${tenants.id} = ${tenantId} FOR UPDATE`);
  const row = (await db.select({ plan: plans }).from(tenants).leftJoin(plans, eq(plans.id, tenants.planId)).where(eq(tenants.id, tenantId)).limit(1))[0];
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Oficina não encontrada." });
  const limit = resource === "members" ? row.plan?.maxUsers : row.plan?.maxCustomers;
  if (limit === null || limit === undefined) return;
  const total = resource === "members"
    ? await db.select({ total: count() }).from(tenantMembers).where(and(eq(tenantMembers.tenantId, tenantId), eq(tenantMembers.active, true)))
    : await db.select({ total: count() }).from(customers).where(eq(customers.tenantId, tenantId));
  if (Number(total[0]?.total ?? 0) >= limit) {
    const label = resource === "members" ? "membros ativos" : "clientes";
    throw new TRPCError({ code: "FORBIDDEN", message: `O limite de ${label} do plano desta oficina foi atingido.` });
  }
}
