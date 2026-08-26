export function getFinanceWorkspaceAction(expectedRevenueCount: number, plannedExpenseCount: number) {
  if (expectedRevenueCount > 0) return { title: "Confirmar recebimentos", description: `${expectedRevenueCount} receita${expectedRevenueCount === 1 ? " aguarda" : "s aguardam"} confirmação manual.` };
  if (plannedExpenseCount > 0) return { title: "Revisar compromissos", description: `${plannedExpenseCount} despesa${plannedExpenseCount === 1 ? " está" : "s estão"} planejada${plannedExpenseCount === 1 ? "" : "s"}.` };
  return { title: "Financeiro em dia", description: "Não há recebimentos ou compromissos pendentes nesta página." };
}
