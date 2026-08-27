import { afterEach, describe, expect, it, vi } from "vitest";
import { isDemoWorkspace, selectWorkspace, withDemoContext, type WorkspaceEntry } from "./demoWorkspace";

const workspaces: WorkspaceEntry[] = [
  { tenant: { id: 10, name: "Oficina normal", slug: "normal", isDemo: false } },
  { tenant: { id: 2, name: "Auto Prime Centro Automotivo", slug: "performance-garage", isDemo: true } },
];

describe("demoWorkspace", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("seleciona somente o tenant marcado como Demo quando o contexto pede Demo", () => {
    expect(selectWorkspace(workspaces, true)?.tenant.id).toBe(2);
    expect(selectWorkspace(workspaces, false, 10)?.tenant.id).toBe(10);
    expect(selectWorkspace(workspaces, true, 10)?.tenant.isDemo).toBe(true);
  });

  it("não inventa um tenant Demo quando a lista não o contém", () => {
    expect(selectWorkspace([workspaces[0]], true)).toBeUndefined();
  });

  it("preserva demo=1 apenas em links internos", () => {
    vi.stubGlobal("window", { location: { search: "?demo=1" } });
    expect(isDemoWorkspace()).toBe(true);
    expect(withDemoContext("/")).toBe("/?demo=1");
    expect(withDemoContext("/os/39?tab=checklist")).toBe("/os/39?tab=checklist&demo=1");
    expect(withDemoContext("https://example.com/public")).toBe("https://example.com/public");
    expect(withDemoContext("/os/39?demo=1")).toBe("/os/39?demo=1");
  });
});
