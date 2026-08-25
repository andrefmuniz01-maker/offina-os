export function financialErrorMessage(resource: string, code?: string) {
  if (code === "FORBIDDEN") return `Seu perfil não possui permissão para visualizar ${resource}.`;
  return `Não foi possível carregar ${resource}. Tente novamente.`;
}
