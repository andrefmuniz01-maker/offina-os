const entityLabels: Record<string, string> = { service: "Serviço", product: "Produto", tenant: "Oficina", quote: "Orçamento", work_order: "Ordem de serviço", customer: "Cliente", vehicle: "Veículo", purchase_order: "Pedido de compra", product_category: "Categoria de produto", service_category: "Categoria de serviço" };
const actionLabels: Record<string, string> = { created: "criado", updated: "atualizado", deleted: "excluído", approved: "aprovado", cancelled: "cancelado", received: "recebido", assigned: "atribuído" };

export function formatAuditAction(action: string) {
  const [entity, actionName] = action.replaceAll("_", " ").toLowerCase().split(".");
  if (!actionName) return action.replaceAll("_", " ");
  return `${entityLabels[entity.replaceAll(" ", "_")] ?? entity} ${actionLabels[actionName] ?? actionName}`;
}
