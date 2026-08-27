import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath = new URL("../../supabase/migrations/20260827_0047_grant_rls_helper_execution.sql", import.meta.url);
const sql = readFileSync(migrationPath, "utf8");

describe("migration de execução dos auxiliares de RLS", () => {
  it("concede somente a authenticated os auxiliares necessários às policies", () => {
    for (const signature of [
      "private.is_super_admin()",
      "private.is_active_member(bigint)",
      "private.can_manage_tenant(bigint)",
      "private.can_view_financial(bigint)",
    ]) {
      expect(sql).toContain(`grant execute on function ${signature} to authenticated;`);
    }
  });

  it("mantém anon e public sem execução direta dos auxiliares privados", () => {
    expect(sql).toContain("revoke all on function private.is_super_admin() from public, anon;");
    expect(sql).toContain("revoke all on function private.is_active_member(bigint) from public, anon;");
    expect(sql).not.toContain("grant execute on function private.is_super_admin() to anon;");
    expect(sql).not.toContain("grant execute on function private.is_active_member(bigint) to anon;");
  });
});
