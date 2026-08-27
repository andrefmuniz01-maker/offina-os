import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migration = await readFile(
  new URL("../supabase/migrations/20260827_0010_public_catalog_security.sql", import.meta.url),
  "utf8",
);

describe("Supabase public catalog security", () => {
  it("removes the public definer view and exposes a narrowly-scoped catalog RPC", () => {
    expect(migration).toContain("drop view if exists public.public_workshop_catalog");
    expect(migration).toContain("create or replace function public.public_get_workshop_catalog");
    expect(migration).toContain("set search_path = public, pg_temp");
    expect(migration).toContain("revoke all on function public.public_get_workshop_catalog");
    expect(migration).toContain("grant execute on function public.public_get_workshop_catalog(text) to anon");
    expect(migration).not.toContain("create view public.public_workshop_catalog");
  });
});
