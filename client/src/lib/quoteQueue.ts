export type QuoteQueueStatus = "draft" | "ready" | "sent" | "viewed" | "approved" | "rejected" | "expired" | "cancelled";

export const quoteStatusLabels: Record<QuoteQueueStatus, string> = {
  draft: "Rascunho",
  ready: "Pronto",
  sent: "Enviado",
  viewed: "Visualizado",
  approved: "Aprovado",
  rejected: "Recusado",
  expired: "Expirado",
  cancelled: "Cancelado",
};

export function getQuoteStatusTone(status: QuoteQueueStatus) {
  if (["draft", "ready"].includes(status)) return "border-amber-200 bg-amber-50 text-amber-800";
  if (["sent", "viewed"].includes(status)) return "border-violet-200 bg-violet-50 text-violet-800";
  if (status === "approved") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

export function getQuoteNextAction(status: QuoteQueueStatus) {
  if (status === "draft") return { title: "Revisar antes de enviar", description: "Confira itens e descontos para deixar a proposta pronta para o cliente." };
  if (status === "ready") return { title: "Preparar envio", description: "Copie a mensagem e revise o conteúdo no WhatsApp antes de enviar." };
  if (status === "sent") return { title: "Acompanhar retorno", description: "O orçamento foi enviado e aguarda a resposta do cliente." };
  if (status === "viewed") return { title: "Conduzir decisão", description: "O cliente já visualizou a proposta; acompanhe aprovação ou ajuste necessário." };
  if (status === "approved") return { title: "Agendar execução", description: "Use a aprovação para reservar estoque e criar a agenda sem redigitação." };
  return { title: "Fluxo encerrado", description: "Nenhuma ação comercial adicional é necessária neste orçamento." };
}

export function getQuoteValidityState(validUntil: Date | string, now = new Date()) {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(validUntil);
  dueDate.setHours(0, 0, 0, 0);
  const days = Math.round((dueDate.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return { label: "Validade vencida", urgency: "critical" as const };
  if (days <= 3) return { label: days === 0 ? "Vence hoje" : `Vence em ${days} dia${days === 1 ? "" : "s"}`, urgency: "attention" as const };
  return { label: `Válido por ${days} dias`, urgency: "normal" as const };
}
