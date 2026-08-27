import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const [queueMigration, assigneeMigration] = await Promise.all([
  readFile(new URL("../supabase/migrations/20260827_0022_quote_request_workspace_rpcs.sql", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20260827_0023_quote_request_assignees_rpc.sql", import.meta.url), "utf8"),
]);

describe("Supabase quote request queue", () => {
  it("restringe a fila aos perfis comerciais autorizados e bloqueia tenant demo", () => {
    expect(queueMigration).toContain("private.can_quotes_manage");
    expect(queueMigration).toContain("tm.role in ('owner', 'admin', 'attendant')");
    expect(queueMigration).toContain("not t.is_demo");
  });

  it("mantém consultas e mutações em fachadas SECURITY INVOKER autenticadas", () => {
    expect(queueMigration).toContain("security invoker set search_path = ''");
    expect(queueMigration).toContain("workspace_list_quote_requests");
    expect(queueMigration).toContain("workspace_update_quote_request");
    expect(queueMigration).toContain("to authenticated");
    expect(queueMigration).toContain("from public, anon");
  });

  it("valida transições, associação ao tenant e registra eventos e auditoria", () => {
    expect(queueMigration).toContain("Não é permitido mudar a solicitação");
    expect(queueMigration).toContain("Responsável não pertence a esta oficina.");
    expect(queueMigration).toContain("'status_changed'");
    expect(queueMigration).toContain("'quote_request.updated'");
  });

  it("oferece responsáveis somente no escopo do tenant ativo", () => {
    expect(assigneeMigration).toContain("where tm.tenant_id = target_tenant_id and tm.active");
    expect(assigneeMigration).toContain("workspace_quote_request_assignees");
    expect(assigneeMigration).toContain("to authenticated");
  });
});
