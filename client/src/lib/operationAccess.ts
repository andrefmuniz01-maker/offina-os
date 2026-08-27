import type { WorkspaceRole } from "@/lib/homeWorkspace";

export function canManageAppointments(role: WorkspaceRole) {
  return role !== "technician";
}

export function getOperationsScopeCopy(role: WorkspaceRole) {
  return role === "technician"
    ? { heading: "Suas OS atribuídas", description: "Acompanhe e atualize somente os veículos atribuídos a você." }
    : { heading: "Pátio operacional", description: "Acompanhe a etapa real de cada OS e avance a operação sem perder contexto." };
}
