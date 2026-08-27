import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migration = await readFile(
  new URL("../supabase/migrations/20260827_0012_harden_public_rpc_context.sql", import.meta.url),
  "utf8",
);

describe("Supabase public RPC hardening", () => {
  it("fixa um search_path vazio para as únicas RPCs anônimas necessárias", () => {
    expect(migration).toContain("alter function public.public_get_workshop_catalog(text)");
    expect(migration).toContain("alter function public.public_submit_quote_request(");
    expect(migration.match(/set search_path = '';/g)).toHaveLength(2);
  });

  it("revoga o acesso padrão e concede execução apenas ao papel anon dos endpoints públicos", () => {
    expect(migration).toContain("from public, authenticated;");
    expect(migration).toContain("grant execute on function public.public_get_workshop_catalog(text) to anon;");
    expect(migration).toContain(") to anon;");
    expect(migration).not.toContain("to authenticated;");
  });
});
