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
  if (!isDemoWorkspace() || !path.startsWith("/")) return path;
  if (path.includes("demo=1")) return path;
  return `${path}${path.includes("?") ? "&" : "?"}demo=1`;
}
