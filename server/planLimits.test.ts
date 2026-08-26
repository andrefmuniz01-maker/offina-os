import { describe, expect, it, vi } from "vitest";
import { assertTenantPlanCapacity } from "./planLimits";

function chain(result: unknown) {
  const query: any = {};
  query.from = vi.fn(() => query);
  query.leftJoin = vi.fn(() => query);
  query.where = vi.fn(() => query);
  query.limit = vi.fn(() => query);
  query.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
  return query;
}

describe("assertTenantPlanCapacity", () => {
  it("permite cadastro abaixo do limite e bloqueia ao atingir a capacidade", async () => {
    const allowed = { select: vi.fn().mockReturnValueOnce(chain([{ plan: { maxUsers: 2, maxCustomers: 3 } }])).mockReturnValueOnce(chain([{ total: 1 }])) };
    await expect(assertTenantPlanCapacity(allowed, 4, "members")).resolves.toBeUndefined();

    const full = { select: vi.fn().mockReturnValueOnce(chain([{ plan: { maxUsers: 2, maxCustomers: 3 } }])).mockReturnValueOnce(chain([{ total: 3 }])) };
    await expect(assertTenantPlanCapacity(full, 4, "customers")).rejects.toMatchObject({ code: "FORBIDDEN", message: "O limite de clientes do plano desta oficina foi atingido." });
  });

  it("não limita clientes quando o plano permite capacidade ilimitada", async () => {
    const db = { select: vi.fn(() => chain([{ plan: { maxUsers: 2, maxCustomers: null } }])) };
    await expect(assertTenantPlanCapacity(db, 4, "customers")).resolves.toBeUndefined();
    expect(db.select).toHaveBeenCalledOnce();
  });
});
