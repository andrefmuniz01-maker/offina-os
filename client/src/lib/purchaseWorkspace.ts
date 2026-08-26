export function getPurchaseWorkspaceAction(openOrders: number, partialOrders: number) {
  if (partialOrders > 0) return { title: "Conferir recebimentos parciais", description: `${partialOrders} pedido${partialOrders === 1 ? " exige" : "s exigem"} conferência antes da reposição.` };
  if (openOrders > 0) return { title: "Acompanhar pedidos em aberto", description: `${openOrders} pedido${openOrders === 1 ? " está" : "s estão"} aguardando recebimento.` };
  return { title: "Nenhum pedido pendente", description: "A fila atual não possui pedidos para receber." };
}
