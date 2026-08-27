import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const [migration, adjustmentMigration] = await Promise.all([
  readFile(new URL("../supabase/migrations/20260827_0016_inventory_purchase_secure_rpcs.sql", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20260827_0011_inventory_adjustment_rpc.sql", import.meta.url), "utf8"),
]);

describe("Supabase inventory and purchases RPC security", () => {
  it("remove acesso direto de anon e authenticated aos saldos, movimentos e pedidos", () => {
    expect(migration).toContain("revoke all on table public.inventory_balances, public.inventory_movements, public.inventory_reservations,");
    expect(migration).toContain("public.purchase_orders, public.purchase_order_items from anon, authenticated;");
  });

  it("expõe somente fachadas SECURITY INVOKER e mantém a lógica privilegiada privada", () => {
    expect(migration).toContain("alter function public.workspace_adjust_inventory(bigint, bigint, numeric, text) set schema private;");
    expect(migration).toContain("create or replace function public.workspace_adjust_inventory");
    expect(migration).toContain("security invoker set search_path = ''");
    expect(migration).toContain("revoke all on function public.workspace_list_inventory");
    expect(migration).toContain(") to authenticated;");
  });

  it("exige autorização do tenant e permissão financeira para custos de compra", () => {
    expect(migration).toContain("perform private.assert_inventory_access(target_tenant_id);");
    expect(migration).toContain("perform private.assert_purchase_access(target_tenant_id, true);");
    expect(migration).toContain("include_financial := private.can_manage_financial_catalog(target_tenant_id);");
    expect(migration).toContain("case when include_financial then jsonb_build_object('currentCost'");
    expect(migration).toContain("case when include_financial then jsonb_build_object('unitCost'");
  });

  it("preserva a atomicidade do recebimento ao atualizar saldo, custo médio, movimento e auditoria", () => {
    expect(migration).toContain("for update;");
    expect(migration).toContain("update public.inventory_balances set physical_quantity = physical_quantity + received_quantity_input");
    expect(migration).toContain("update public.products set current_cost = target_item.unit_cost, average_cost = next_average");
    expect(migration).toContain("'purchase_entry'");
    expect(migration).toContain("'purchase_order.received'");
  });

  it("inclui reservas, agenda e OS na previsão, sem permitir ajuste abaixo do reservado", () => {
    expect(migration).toContain("from public.inventory_reservations r where r.tenant_id = target_tenant_id and r.status = 'active'");
    expect(migration).toContain("from public.appointments a join public.quote_items");
    expect(migration).toContain("from public.work_orders wo join public.work_order_items");
    expect(adjustmentMigration).toContain("physical_quantity + quantity_delta_input >= reserved_quantity");
  });
});
