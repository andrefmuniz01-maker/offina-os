import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migration = await readFile(
  new URL("../supabase/migrations/20260826_0004_demo_tenant_marker.sql", import.meta.url),
  "utf8",
);

describe("Supabase demo tenant marker", () => {
  it("adds an indexed administrative marker without weakening RLS", () => {
    expect(migration).toContain("add column if not exists is_demo boolean not null default false");
    expect(migration).toContain("create index if not exists tenants_is_demo_idx");
    expect(migration).toContain("where is_demo");
    expect(migration).toContain("Não altera autenticação, autorização, RLS ou regras de negócio.");
    expect(migration).not.toMatch(/create policy|alter table .* disable row level security/i);
  });
});
