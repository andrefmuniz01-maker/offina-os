import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const [catalogMigration, facadeMigration] = await Promise.all([
  readFile(new URL("../supabase/migrations/20260827_0014_catalog_secure_rpcs.sql", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20260827_0015_catalog_public_invoker_facades.sql", import.meta.url), "utf8"),
]);

describe("Supabase catalog RPC security", () => {
  it("remove a leitura direta do catálogo para anon e authenticated", () => {
    expect(catalogMigration).toContain("revoke all on table public.product_categories, public.service_categories, public.suppliers,");
    expect(catalogMigration).toContain("public.kits, public.kit_items from anon, authenticated;");
  });

  it("mantém as RPCs internas inacessíveis ao público e somente executáveis por authenticated", () => {
    expect(facadeMigration).toContain("from public, anon;");
    expect(facadeMigration).toContain(") to authenticated;");
    expect(facadeMigration).toContain("set schema private;");
    expect(facadeMigration).toContain("security invoker set search_path = ''");
    expect(facadeMigration).not.toContain("security definer set search_path = ''");
  });

  it("verifica tenant, papel e escopo financeiro antes de projetar ou alterar dados sensíveis", () => {
    expect(catalogMigration).toContain("perform private.assert_catalog_access(target_tenant_id);");
    expect(catalogMigration).toContain("perform private.assert_catalog_access(target_tenant_id, true);");
    expect(catalogMigration).toContain("include_financial := private.can_manage_financial_catalog(target_tenant_id);");
    expect(catalogMigration).toContain("case when include_financial then jsonb_build_object('currentCost'");
    expect(catalogMigration).toContain("case when include_financial then jsonb_build_object('estimatedCost'");
  });

  it("cria produto, saldo inicial e auditoria no mesmo fluxo transacional", () => {
    expect(catalogMigration).toContain("insert into public.products(");
    expect(catalogMigration).toContain("insert into public.inventory_balances(tenant_id, product_id) values(target_tenant_id, created_id);");
    expect(catalogMigration).toContain("'product.created', 'product', created_id");
  });

  it("bloqueia relações de outra oficina nas composições de serviço e kit", () => {
    expect(catalogMigration).toContain("not exists(select 1 from public.products where id = item_product_id and tenant_id = target_tenant_id)");
    expect(catalogMigration).toContain("O kit possui produto de outra oficina.");
    expect(catalogMigration).toContain("O kit possui serviço de outra oficina.");
  });
});
