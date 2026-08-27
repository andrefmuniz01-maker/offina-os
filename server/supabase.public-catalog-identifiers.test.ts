import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migration = await readFile(
  new URL("../supabase/migrations/20260827_0013_remove_public_tenant_id.sql", import.meta.url),
  "utf8",
);

describe("Supabase public catalog identifiers", () => {
  it("mantém o slug público, mas não retorna o ID interno do tenant", () => {
    expect(migration).toContain("'slug', target_tenant.slug");
    expect(migration).not.toContain("'id', target_tenant.id");
    expect(migration).toContain("set search_path = ''");
  });
});
