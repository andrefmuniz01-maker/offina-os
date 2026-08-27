import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migration = await readFile(
  new URL("../supabase/migrations/20260827_0009_public_quote_requests.sql", import.meta.url),
  "utf8",
);

describe("Supabase public quote requests", () => {
  it("exposes only a filtered commercial catalog and a narrowly-scoped submission function", () => {
    expect(migration).toContain("create or replace view public.public_workshop_catalog");
    expect(migration).toContain("where t.active and t.status = 'active'");
    expect(migration).toContain("create or replace function public.public_submit_quote_request");
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = public, pg_temp");
    expect(migration).toContain("revoke all on function public.public_submit_quote_request");
    expect(migration).toContain("grant execute on function public.public_submit_quote_request");
    expect(migration).toContain("'quote_request.created'");
    expect(migration).not.toContain("grant select on public.customers to anon");
    expect(migration).not.toContain("grant select on public.quote_requests to anon");
  });
});
