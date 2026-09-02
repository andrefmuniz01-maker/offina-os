export type WorkspaceEntry = {
  tenant: {
    id: number;
    name: string;
    slug: string;
    isDemo?: boolean;
  };
  /**
   * false quando a linha só existe porque o Super Admin enxerga toda oficina
   * (bypass de private.is_active_member), sem vínculo real em tenant_members.
   * Sem essa distinção, o primeiro item da lista (ordenada por nome) seria
   * uma oficina arbitrária para qualquer Super Admin, em vez da oficina onde
   * a pessoa de fato trabalha.
   */
  isMember?: boolean;
};

export function isDemoWorkspace() {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("demo") === "1";
}

/**
 * Modo suporte: o Super Admin "entra como" uma oficina real a partir do
 * painel /plataforma para diagnosticar ou corrigir algo, com ação completa
 * (ele já contorna toda permissão no banco). O alvo viaja pela URL
 * (?asTenant=<id>), no mesmo estilo do ?demo=1, e é propagado por
 * withDemoContext em toda navegação interna via SafeLink/DashboardLayout.
 */
export function getSupportTenantId(): number | null {
  if (typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get("asTenant");
  const parsed = raw ? Number(raw) : NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function selectWorkspace<T extends WorkspaceEntry>(workspaces: T[] | undefined, preferDemo: boolean, activeTenantId?: number | null) {
  if (!workspaces?.length) return undefined;
  if (preferDemo) return workspaces.find(entry => entry.tenant.isDemo) ?? undefined;
  if (activeTenantId != null) {
    const active = workspaces.find(entry => entry.tenant.id === activeTenantId);
    if (active) return active;
  }
  return workspaces.find(entry => entry.isMember) ?? workspaces[0];
}

export function withDemoContext(path: string) {
  if (!path.startsWith("/")) return path;
  const extraParams: string[] = [];
  if (isDemoWorkspace() && !path.includes("demo=1")) extraParams.push("demo=1");
  const supportTenantId = getSupportTenantId();
  if (supportTenantId && !path.includes("asTenant=")) extraParams.push(`asTenant=${supportTenantId}`);
  if (!extraParams.length) return path;
  return `${path}${path.includes("?") ? "&" : "?"}${extraParams.join("&")}`;
}
