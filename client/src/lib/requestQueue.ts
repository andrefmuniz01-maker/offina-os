export type RequestQueueStatus = "new" | "in_analysis" | "awaiting_information" | "in_quoting" | "ready" | "sent" | "approved" | "rejected" | "expired" | "cancelled";

export const requestStatusLabels: Record<RequestQueueStatus, string> = {
  new: "Nova",
  in_analysis: "Em análise",
  awaiting_information: "Aguardando informação",
  in_quoting: "Em orçamento",
  ready: "Pronta",
  sent: "Enviada",
  approved: "Aprovada",
  rejected: "Recusada",
  expired: "Expirada",
  cancelled: "Cancelada",
};

export function getRequestStatusTone(status: RequestQueueStatus) {
  if (status === "new") return "border-orange-200 bg-orange-50 text-orange-800";
  if (["in_analysis", "in_quoting"].includes(status)) return "border-blue-200 bg-blue-50 text-blue-800";
  if (status === "awaiting_information") return "border-amber-200 bg-amber-50 text-amber-800";
  if (["ready", "sent"].includes(status)) return "border-violet-200 bg-violet-50 text-violet-800";
  if (status === "approved") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

export function getRequestNextAction(status: RequestQueueStatus, hasLinkedService: boolean) {
  if (status === "new") return { title: "Iniciar atendimento", description: "Assuma a solicitação e valide os dados do cliente antes de orçar." };
  if (status === "awaiting_information") return { title: "Aguardar retorno", description: "O cliente precisa complementar dados para a avaliação continuar." };
  if (["in_analysis", "in_quoting", "ready"].includes(status) && hasLinkedService) return { title: "Preparar orçamento", description: "Gere a sugestão a partir do serviço e revise itens antes do envio." };
  if (["in_analysis", "in_quoting", "ready"].includes(status)) return { title: "Confirmar serviço", description: "Defina o serviço solicitado antes de gerar o orçamento." };
  if (status === "sent") return { title: "Acompanhar resposta", description: "O orçamento já foi enviado; acompanhe a decisão do cliente." };
  if (status === "approved") return { title: "Agendar execução", description: "O próximo passo é reservar a janela da oficina e iniciar a OS." };
  return { title: "Fluxo encerrado", description: "Esta solicitação não requer nova ação comercial agora." };
}

export function getQueueUrgency(queueMinutes: number) {
  if (queueMinutes >= 24 * 60) return "critica";
  if (queueMinutes >= 4 * 60) return "atenção";
  return "normal";
}
