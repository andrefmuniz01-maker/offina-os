import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(import.meta.dirname, "../supabase/migrations/20260827_0018_exclude_demo_from_public_flows.sql"),
  "utf8",
);

describe("limite público de tenants demo", () => {
  it("exclui tenant demo do catálogo público e do intake anônimo", () => {
    const demoFilters = migration.match(/and not is_demo;/g) ?? [];
    expect(demoFilters).toHaveLength(2);
  });

  it("preserva search_path vazio e ACL anônima mínima nas RPCs públicas", () => {
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("grant execute on function public.public_get_workshop_catalog(text) to anon");
    expect(migration).toContain("public.public_submit_quote_request(text, text, text, text, text, text, integer, text, integer, bigint, text, text, jsonb) to anon");
  });
});
