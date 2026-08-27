export type WorkspaceRole = "owner" | "admin" | "attendant" | "technician";
export type WorkspaceDailyMenuKey = "today" | "requests" | "quotes" | "operations" | "inventory" | "customers" | "team" | "finance" | "settings";
export type WorkspaceDailyPriorityKey = "commercial" | "operation" | "inventory";

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
  const operation = [
    { label: "Operação em andamento", value: String(stats.operation.inProgress), detail: `${stats.operation.yard} veículo(s) no pátio` },
  ];
  if (role === "technician") return operation;

  const commercial = [
    { label: "Orçamentos em aberto", value: money.format(stats.commercial.pendingQuoteValue), detail: `${stats.commercial.pendingQuoteCount} oportunidade(s) aguardando` },
  ];
  if (role === "attendant") return [...commercial, ...operation];

  const inventory = [
    { label: "Estoque crítico", value: String(stats.inventory.critical), detail: `${stats.inventory.reservedProducts} produto(s) com reserva` },
  ];
  if (!stats.sales) return [...commercial, ...operation, ...inventory];
  return [{ label: "Faturamento recebido", value: money.format(stats.sales.billing), detail: `${stats.sales.completedOrders} OS concluída(s) no período` }, ...commercial, ...operation, ...inventory];
}

export function getWorkspaceMenuKeys(role: WorkspaceRole): WorkspaceDailyMenuKey[] {
  if (role === "technician") return ["today", "operations"];
  if (role === "attendant") return ["today", "requests", "quotes", "operations", "customers"];
  return ["today", "requests", "quotes", "operations", "inventory", "customers", "team", "finance", "settings"];
}

export function getWorkspacePriorityKeys(role: WorkspaceRole): WorkspaceDailyPriorityKey[] {
  if (role === "technician") return ["operation"];
  if (role === "attendant") return ["commercial", "operation"];
  return ["commercial", "operation", "inventory"];
}

export function getWorkspaceNoTenantState(platformRole?: string | null) {
  return platformRole === "super_admin" ? "platform" : "membership_missing";
}

export function getHomeNavigationContext(platformRole?: string | null) {
  return platformRole === "super_admin" ? "platform" : "workspace";
}
