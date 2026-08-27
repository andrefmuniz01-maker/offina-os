import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const [rbacMigration, rpcsMigration] = await Promise.all([
  readFile(new URL("../supabase/migrations/20260827_0007_customer_vehicle_rbac.sql", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20260827_0008_customer_vehicle_rpcs.sql", import.meta.url), "utf8"),
]);

describe("Supabase customers and vehicles", () => {
  it("allows the attendance flow while keeping audit records append-only", () => {
    expect(rbacMigration).toContain("create policy customers_insert");
    expect(rbacMigration).toContain("create policy vehicles_insert");
    expect(rbacMigration).toContain("drop policy if exists audit_logs_update");
    expect(rbacMigration).toContain("drop policy if exists audit_logs_delete");
    expect(rbacMigration).toContain("create policy audit_logs_append");
    expect(rbacMigration).toContain("actor_user_id = auth.uid()");
  });

  it("uses invoker RPCs to create the records and their audit events atomically", () => {
    expect(rpcsMigration).toContain("create or replace function public.workspace_create_customer");
    expect(rpcsMigration).toContain("create or replace function public.workspace_create_vehicle");
    expect((rpcsMigration.match(/security invoker/g) ?? []).length).toBe(2);
    expect(rpcsMigration).not.toContain("security definer");
    expect(rpcsMigration).toContain("'customer.created'");
    expect(rpcsMigration).toContain("'vehicle.created'");
    expect(rpcsMigration).toContain("Cliente não encontrado nesta oficina.");
  });
});
