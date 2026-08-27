export function getInventoryAccessMessage(code?: string) {
  return code === "FORBIDDEN"
    ? "Seu perfil não possui acesso ao inventário desta oficina. Peça a um dono ou administrador para revisar suas permissões."
    : "Não foi possível carregar o inventário desta oficina. Tente novamente.";
}
