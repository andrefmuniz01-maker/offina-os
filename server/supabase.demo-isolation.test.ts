import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const [isolationMigration, provisioningMigration] = await Promise.all([
  readFile(new URL("../supabase/migrations/20260827_0019_demo_super_admin_isolation.sql", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20260827_0020_internal_demo_provisioning.sql", import.meta.url), "utf8"),
]);

describe("Supabase internal demo isolation", () => {
  it("limita a demonstração a Super Admins nas políticas e permissões privadas", () => {
    expect(isolationMigration).toContain("and not t.is_demo");
    expect(isolationMigration).toContain("select private.is_super_admin() or exists");
    expect(isolationMigration).toContain("create or replace function private.can_catalog_manage");
    expect(isolationMigration).toContain("create or replace function private.can_inventory_manage");
    expect(isolationMigration).toContain("create or replace function private.can_purchase_manage");
  });

  it("não permite exposição pública por catálogo ou intake", () => {
    expect(isolationMigration).toContain("status = 'active' and not is_demo");
    expect(isolationMigration).toContain("public.public_get_workshop_catalog");
    expect(isolationMigration).toContain("public.public_submit_quote_request");
  });

  it("cria tenant demo sem vínculos de tenant e registra auditoria", () => {
    expect(provisioningMigration).toContain("values('Performance Garage', 'performance-garage', 'active', true, true, null)");
    expect(provisioningMigration).not.toContain("insert into public.tenant_members");
    expect(provisioningMigration).toContain("'demo.incremental_provisioned'");
    expect(provisioningMigration).toContain("'visibility', 'super_admin_only'");
  });

  it("mantém o reset limitado ao slug e bloqueia dados de domínios não migrados", () => {
    expect(provisioningMigration).toContain("where slug = 'performance-garage' and is_demo and active");
    expect(provisioningMigration).toContain("Reset incremental bloqueado: a demonstração contém dados de domínios ainda não migrados.");
    expect(provisioningMigration).toContain("'demo.incremental_reset'");
  });

  it("expõe ações administrativas apenas por fachadas SECURITY INVOKER autenticadas", () => {
    expect(provisioningMigration).toContain("security invoker set search_path = ''");
    expect(provisioningMigration).toContain("from public, anon;");
    expect(provisioningMigration).toContain("to authenticated;");
    expect(provisioningMigration).toContain("Apenas Super Admin pode provisionar ou resetar a demonstração.");
  });
});
