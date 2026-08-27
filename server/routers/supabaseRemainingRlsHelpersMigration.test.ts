import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath = new URL("../../supabase/migrations/20260827_0048_grant_remaining_rls_helper_execution.sql", import.meta.url);
const sql = readFileSync(migrationPath, "utf8");

const helperSignatures = [
  "private.can_catalog_manage(bigint)",
  "private.can_manage_financial_catalog(bigint)",
  "private.can_inventory_manage(bigint)",
  "private.can_purchase_manage(bigint)",
  "private.can_quotes_manage(bigint)",
  "private.can_appointments_manage(bigint)",
  "private.can_work_order_operate(bigint)",
  "private.can_work_orders_manage(bigint)",
  "private.can_execute_work_order(bigint, bigint)",
];

describe("migration dos auxiliares operacionais de RLS", () => {
  it("permite a avaliação das policies apenas para sessões autenticadas", () => {
    for (const signature of helperSignatures) {
      expect(sql).toContain(`grant execute on function ${signature} to authenticated;`);
      expect(sql).toContain(`revoke all on function ${signature} from public, anon;`);
    }
  });

  it("não cria nenhum grant anônimo para os auxiliares privados", () => {
    expect(sql).not.toMatch(/grant execute on function private\.can_[^(]+\([^)]*\) to anon;/);
  });
});
