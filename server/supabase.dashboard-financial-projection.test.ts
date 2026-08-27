import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migration = await readFile(
  new URL("../supabase/migrations/20260827_0017_dashboard_financial_projection.sql", import.meta.url),
  "utf8",
);

describe("Supabase workspace dashboard financial projection", () => {
  it("projeta sales e finance somente após a guarda owner/admin", () => {
    expect(migration).toContain("role in ('owner', 'admin')");
    expect(migration).toContain("if can_view_finance then");
    expect(migration).toContain("'sales', jsonb_build_object");
    expect(migration).toContain("'finance', jsonb_build_object");
  });

  it("mantém o dashboard somente autenticado e sem EXECUTE para anon", () => {
    expect(migration).toContain("security invoker");
    expect(migration).toContain("revoke all on function public.workspace_dashboard_overview(bigint) from public, anon");
    expect(migration).toContain("grant execute on function public.workspace_dashboard_overview(bigint) to authenticated");
  });
});
