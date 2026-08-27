export type WorkspaceEntry = {
  tenant: {
    id: number;
    name: string;
    slug: string;
    isDemo?: boolean;
  };
};

export function isDemoWorkspace() {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("demo") === "1";
}

export function selectWorkspace<T extends WorkspaceEntry>(workspaces: T[] | undefined, preferDemo: boolean, activeTenantId?: number | null) {
  if (!workspaces?.length) return undefined;
  if (preferDemo) return workspaces.find(entry => entry.tenant.isDemo) ?? undefined;
  return workspaces.find(entry => entry.tenant.id === activeTenantId) ?? workspaces[0];
}

export function withDemoContext(path: string) {
  if (!isDemoWorkspace() || !path.startsWith("/")) return path;
  if (path.includes("demo=1")) return path;
  return `${path}${path.includes("?") ? "&" : "?"}demo=1`;
}
