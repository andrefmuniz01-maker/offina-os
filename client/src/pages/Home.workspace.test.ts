import { describe, expect, it } from "vitest";
import { canViewWorkspaceFinancials, getHomeNavigationContext, getWorkspaceMetrics, getWorkspaceNoTenantState } from "@/lib/homeWorkspace";

const stats = {
  sales: { billing: 1250, completedOrders: 2 },
  commercial: { pendingQuoteValue: 500, pendingQuoteCount: 1 },
  operation: { scheduled: 3, inProgress: 1, yard: 2 },
  inventory: { critical: 4, reservedProducts: 2 },
};

describe("central operacional do workspace", () => {
  it("libera a leitura financeira somente para owner e admin", () => {
    expect(canViewWorkspaceFinancials("owner")).toBe(true);
    expect(canViewWorkspaceFinancials("admin")).toBe(true);
    expect(canViewWorkspaceFinancials("attendant")).toBe(false);
    expect(canViewWorkspaceFinancials("technician")).toBe(false);
  });

  it("mantém o faturamento fora da central de papéis operacionais", () => {
    expect(getWorkspaceMetrics(stats, "owner").map(metric => metric.label)).toContain("Faturamento recebido");
    expect(getWorkspaceMetrics(stats, "attendant").map(metric => metric.label)).not.toContain("Faturamento recebido");
    expect(getWorkspaceMetrics(stats, "technician")).toHaveLength(3);
  });

  it("não interpreta a ausência de vendas como zero quando o banco oculta finanças", () => {
    const statsWithoutSales = { ...stats, sales: undefined };
    expect(getWorkspaceMetrics(statsWithoutSales, "owner").map(metric => metric.label)).not.toContain("Faturamento recebido");
  });

  it("direciona Super Admin sem oficina ao contexto Platform, sem abrir criação operacional", () => {
    expect(getWorkspaceNoTenantState("super_admin")).toBe("platform");
    expect(getWorkspaceNoTenantState("owner")).toBe("membership_missing");
    expect(getWorkspaceNoTenantState(null)).toBe("membership_missing");
  });

  it("mantém a navegação global fora do menu operacional, mesmo com vínculo transitório", () => {
    expect(getHomeNavigationContext("super_admin")).toBe("platform");
    expect(getHomeNavigationContext("owner")).toBe("workspace");
    expect(getHomeNavigationContext(undefined)).toBe("workspace");
  });
});
