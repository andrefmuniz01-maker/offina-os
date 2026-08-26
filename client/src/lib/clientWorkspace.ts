export function getClientWorkspaceStep(hasCustomer: boolean, vehicleCount: number, hasSelectedVehicle: boolean) {
  if (!hasCustomer) return { title: "Selecionar cliente", description: "Busque o proprietário para consultar veículos e histórico da oficina." };
  if (!vehicleCount) return { title: "Cadastrar primeiro veículo", description: "Registre o veículo para conectar futuras solicitações e ordens de serviço." };
  if (!hasSelectedVehicle) return { title: "Abrir veículo", description: "Selecione um veículo para revisar seu histórico de execução." };
  return { title: "Consultar histórico", description: "O contexto do cliente e do veículo está pronto para o próximo atendimento." };
}
