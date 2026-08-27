import { describe, expect, it } from "vitest";
import { canViewWorkspaceFinancials, getWorkspaceMetrics } from "./Home";

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
});
