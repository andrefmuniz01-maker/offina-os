import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(process.cwd(), "supabase/migrations/20260827_0046_reconcile_remote_work_order_projection_and_notes.sql");

describe("migration 0046 de reconciliação de OS", () => {
  it("restaura uma projeção mínima e bloqueia a fachada de apontamentos não aprovada", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("create or replace function private.secure_work_order_detail");
    expect(sql).toContain("'description', i.description, 'itemType', i.item_type, 'quantity', i.quantity");
    expect(sql).toContain("'description', p.name, 'quantity', r.quantity");
    expect(sql).not.toContain("'unitPrice'");
    expect(sql).not.toContain("'productId'");
    expect(sql).not.toContain("'consumption'");
    expect(sql).not.toContain("'executionAttachments'");
    expect(sql).not.toContain("'notes', coalesce");
    expect(sql).toContain("revoke all on function private.secure_add_work_order_note(bigint, bigint, text) from public, anon, authenticated");
    expect(sql).toContain("revoke all on function public.workspace_add_work_order_note(bigint, bigint, text) from public, anon, authenticated");
  });
});
