export type WorkspaceRole = "owner" | "admin" | "attendant" | "technician";

export type DashboardStats = {
  sales?: { billing: number; completedOrders: number };
  commercial: { pendingQuoteValue: number; pendingQuoteCount: number };
  operation: { scheduled: number; inProgress: number; yard: number };
  inventory: { critical: number; reservedProducts: number };
};

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function canViewWorkspaceFinancials(role: WorkspaceRole) {
  return role === "owner" || role === "admin";
}

export function getWorkspaceMetrics(stats: DashboardStats, role: WorkspaceRole) {
  const operational = [
    { label: "Orçamentos em aberto", value: money.format(stats.commercial.pendingQuoteValue), detail: `${stats.commercial.pendingQuoteCount} oportunidade(s) aguardando` },
    { label: "Operação em andamento", value: String(stats.operation.inProgress), detail: `${stats.operation.yard} veículo(s) no pátio` },
    { label: "Estoque crítico", value: String(stats.inventory.critical), detail: `${stats.inventory.reservedProducts} produto(s) com reserva` },
  ];
  if (!canViewWorkspaceFinancials(role) || !stats.sales) return operational;
  return [{ label: "Faturamento recebido", value: money.format(stats.sales.billing), detail: `${stats.sales.completedOrders} OS concluída(s) no período` }, ...operational];
}

export function getWorkspaceNoTenantState(platformRole?: string | null) {
  return platformRole === "super_admin" ? "platform" : "membership_missing";
}

export function getHomeNavigationContext(platformRole?: string | null) {
  return platformRole === "super_admin" ? "platform" : "workspace";
}
