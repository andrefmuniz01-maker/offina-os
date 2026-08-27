import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migration = await readFile(
  new URL("../supabase/migrations/20260827_0011_inventory_adjustment_rpc.sql", import.meta.url),
  "utf8",
);

describe("Supabase inventory adjustment", () => {
  it("keeps the physical balance at or above reservations and records the operation", () => {
    expect(migration).toContain("create or replace function public.workspace_adjust_inventory");
    expect(migration).toContain("security invoker");
    expect(migration).toContain("physical_quantity + quantity_delta_input >= reserved_quantity");
    expect(migration).toContain("'inventory.adjusted'");
    expect(migration).toContain("insert into public.inventory_movements");
    expect(migration).toContain("insert into public.audit_logs");
    expect(migration).toContain("grant execute on function public.workspace_adjust_inventory");
    expect(migration).not.toContain("security definer");
  });
});
