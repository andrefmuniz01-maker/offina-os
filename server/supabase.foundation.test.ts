import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationUrl = new URL(
  "../supabase/migrations/20260826_0001_oficinaos_foundation.sql",
  import.meta.url,
);
const migration = await readFile(migrationUrl, "utf8");

describe("Supabase foundation migration", () => {
  it("declares the official identity bridge to Supabase Auth", () => {
    expect(migration).toContain("references auth.users(id) on delete cascade");
    expect(migration).toContain("create trigger auth_user_profile_trigger");
    expect(migration).not.toContain("openId");
  });

  it("creates the principal multi-tenant domain tables with RLS", () => {
    for (const table of ["profiles", "tenants", "tenant_members"]) {
      expect(migration).toContain(`create table public.${table}`);
      expect(migration).toContain(`alter table public.${table} enable row level security`);
    }

    for (const table of [
      "customers",
      "vehicles",
      "products",
      "inventory_balances",
      "quotes",
      "work_orders",
      "revenues",
      "expenses",
      "attachments",
      "audit_logs",
    ]) {
      expect(migration).toContain(`create table public.${table}`);
      expect(migration).toContain(`select private.apply_tenant_policies('public.${table}'`);
    }
  });

  it("keeps owner attribution under Super Admin control", () => {
    expect(migration).toContain("private.is_super_admin() or (private.can_manage_tenant(tenant_id) and role <> 'owner')");
    expect(migration).toContain("create or replace function private.is_super_admin()");
  });

  it("uses a private tenant-prefixed storage bucket and removes public helper execution", () => {
    expect(migration).toContain("'oficina-private', 'oficina-private', false");
    expect(migration).toContain("name ~ '^[0-9]+/'");
    expect(migration).toContain("revoke all on all functions in schema private from public, anon, authenticated");
  });

  it("keeps the follow-up migration responsible for covering foreign keys with indexes", async () => {
    const indexMigration = await readFile(
      new URL("../supabase/migrations/20260826_0002_foreign_key_indexes.sql", import.meta.url),
      "utf8",
    );

    expect(indexMigration).toContain("c.contype = 'f'");
    expect(indexMigration).toContain("create index if not exists");
  });

  it("wraps profile Auth lookups in statement-scoped selects", async () => {
    const profilePolicyMigration = await readFile(
      new URL("../supabase/migrations/20260826_0003_profile_rls_initplan.sql", import.meta.url),
      "utf8",
    );

    expect(profilePolicyMigration).toContain("id = (select auth.uid())");
    expect(profilePolicyMigration).toContain("(select private.is_super_admin())");
  });
});
