import type { DemoRole } from "./demoWorkspace";

export type StagingValidationStep = {
  role: DemoRole;
  title: string;
  route: string;
  assertion: string;
};

export const stagingValidationSteps: StagingValidationStep[] = [
  {
    role: "owner",
    title: "Confirmar leitura gerencial do tenant ativo",
    route: "/",
    assertion: "Indicadores financeiros e operacionais aparecem somente para a oficina e o papel corretos.",
  },
  {
    role: "attendant",
    title: "Conduzir a cadeia comercial sem expor custo interno",
    route: "/solicitacoes → /orcamentos → /operacao",
    assertion: "Solicitação, proposta, aprovação, reserva e agenda preservam o mesmo tenant sem revelar margem ou custo.",
  },
  {
    role: "technician",
    title: "Executar OS atribuída e registrar consumo",
    route: "/operacao → /os/:id",
    assertion: "Checklist, notas, anexos e consumo ficam limitados à ordem atribuída; saldos só mudam pela execução autorizada.",
  },
];

export function getStagingValidationStep(role: DemoRole) {
  return stagingValidationSteps.find(step => step.role === role) ?? stagingValidationSteps[0];
}
