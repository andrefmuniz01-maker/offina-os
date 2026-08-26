export type DemoRole = "owner" | "attendant" | "technician";
export type DemoModule = "dashboard" | "requests" | "quotes" | "schedule" | "inventory" | "workOrder";
export type DemoState = "ready" | "loading" | "empty" | "error";

export type DemoModuleDefinition = {
  id: DemoModule;
  label: string;
  entity: string;
  summary: string;
  nextAction: string;
};

export const demoRoles: Record<DemoRole, { label: string; summary: string }> = {
  owner: { label: "Dono", summary: "Acompanha operação, indicadores e decisões financeiras." },
  attendant: { label: "Atendente", summary: "Conduz atendimento, orçamento, aprovação e agenda." },
  technician: { label: "Técnico", summary: "Executa ordens de serviço, checklist e consumo de peças." },
};

export const demoModules: DemoModuleDefinition[] = [
  { id: "dashboard", label: "Painel", entity: "workspace", summary: "Leitura integrada dos sinais comerciais e operacionais.", nextAction: "Avaliar a próxima prioridade da oficina." },
  { id: "requests", label: "Solicitações", entity: "quote_request", summary: "Entrada comercial organizada antes de existir um orçamento.", nextAction: "Qualificar a demanda e preparar uma sugestão." },
  { id: "quotes", label: "Orçamentos", entity: "quote", summary: "Preço, disponibilidade, validade e decisão do cliente em um único fluxo.", nextAction: "Enviar proposta ou acompanhar a resposta." },
  { id: "schedule", label: "Agenda", entity: "appointment", summary: "Capacidade, baia, profissional e status de atendimento conectados à OS.", nextAction: "Confirmar o planejamento da execução." },
  { id: "inventory", label: "Estoque", entity: "inventory_balance", summary: "Saldo físico, reservado e disponível para decisões seguras.", nextAction: "Verificar criticidade e necessidade de reposição." },
  { id: "workOrder", label: "Ordem de serviço", entity: "work_order", summary: "Execução técnica, checklist, consumo e histórico do veículo.", nextAction: "Registrar andamento ou finalizar a entrega." },
];

const deniedModules: Record<DemoRole, DemoModule[]> = {
  owner: [],
  attendant: [],
  technician: ["dashboard", "requests", "quotes", "inventory"],
};

export function canAccessDemoModule(role: DemoRole, module: DemoModule) {
  return !deniedModules[role].includes(module);
}

export function getDemoStateCopy(state: DemoState) {
  const copy: Record<DemoState, { title: string; detail: string }> = {
    ready: {
      title: "Contexto protegido pronto para consulta",
      detail: "Em staging, a API aplica tenant, papel e permissões antes de retornar qualquer registro operacional.",
    },
    loading: {
      title: "Consultando os recursos permitidos",
      detail: "A experiência mantém o usuário informado enquanto o contexto da oficina e os dados do módulo são resolvidos.",
    },
    empty: {
      title: "Nenhum registro para exibir neste contexto",
      detail: "O estado vazio orienta a próxima ação sem inventar clientes, veículos ou resultados da operação.",
    },
    error: {
      title: "Não foi possível carregar este módulo",
      detail: "O erro é explicado de forma recuperável; ações que poderiam gravar dados permanecem indisponíveis até a reconexão.",
    },
  };

  return copy[state];
}
