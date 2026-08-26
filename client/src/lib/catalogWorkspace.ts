export function getCatalogWorkspaceSummary(counts: { products: number; services: number; kits: number; suppliers: number; customers: number }) {
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const nextAction = counts.products === 0 ? "Cadastre o primeiro produto" : counts.services === 0 ? "Cadastre o primeiro serviço" : "Mantenha o catálogo pronto para orçar";
  return { total, nextAction };
}
