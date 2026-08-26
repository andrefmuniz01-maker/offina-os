export type YardQueueStatus = "scheduled" | "received" | "diagnosis" | "awaiting_approval" | "awaiting_part" | "in_service" | "completed";

export function getOperationNextAction(status: YardQueueStatus) {
  if (status === "scheduled") return { title: "Confirmar recebimento", description: "Prepare a baia e registre a chegada do veículo." };
  if (status === "received") return { title: "Iniciar diagnóstico", description: "Valide o escopo antes de avançar para a execução." };
  if (status === "diagnosis") return { title: "Concluir avaliação", description: "Defina a necessidade de aprovação ou de peças." };
  if (status === "awaiting_approval") return { title: "Acompanhar aprovação", description: "A execução depende da decisão comercial do cliente." };
  if (status === "awaiting_part") return { title: "Acompanhar peça", description: "Confirme disponibilidade antes de retomar o serviço." };
  if (status === "in_service") return { title: "Registrar execução", description: "Mantenha checklist, consumo e observações atualizados." };
  return { title: "Preparar entrega", description: "Revise a OS e avance para a entrega do veículo." };
}

export function getYardStatusTone(status: YardQueueStatus) {
  if (status === "scheduled") return "border-slate-200 bg-slate-50";
  if (["received", "diagnosis"].includes(status)) return "border-blue-100 bg-blue-50/60";
  if (["awaiting_approval", "awaiting_part"].includes(status)) return "border-amber-100 bg-amber-50/60";
  if (status === "in_service") return "border-orange-100 bg-orange-50/60";
  return "border-emerald-100 bg-emerald-50/60";
}
