import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migration = await readFile(
  new URL("../supabase/migrations/20260827_0006_workspace_rpc_security_invoker.sql", import.meta.url),
  "utf8",
);

describe("Supabase workspace RPCs", () => {
  it("preserves RLS by using SECURITY INVOKER for each authenticated workspace operation", () => {
    for (const functionName of [
      "platform_create_tenant",
      "my_workspaces",
      "workspace_dashboard_overview",
      "workspace_notifications",
    ]) {
      expect(migration).toContain(`create or replace function public.${functionName}`);
    }

    expect((migration.match(/security invoker/g) ?? []).length).toBe(4);
    expect(migration).not.toContain("security definer");
    expect(migration).toContain("where id = auth.uid() and platform_role = 'super_admin'");
  });
});
