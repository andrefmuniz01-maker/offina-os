import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migration = await readFile(new URL("../supabase/migrations/20260827_0021_public_intake_private_attachments.sql", import.meta.url), "utf8");

describe("Supabase public intake with private attachments", () => {
  it("usa bucket privado com limites explícitos de tamanho e MIME", () => {
    expect(migration).toContain("'quote-request-attachments'");
    expect(migration).toContain("false,");
    expect(migration).toContain("5242880");
    expect(migration).toContain("'video/quicktime'");
  });

  it("permite apenas inserção por capacidade efêmera e não cria leitura anônima", () => {
    expect(migration).toContain("create policy public_quote_request_attachment_insert on storage.objects");
    expect(migration).toContain("private.can_insert_public_quote_attachment(name, metadata)");
    expect(migration).toContain("capability.expires_at > now()");
    expect(migration).toContain("capability.finalized_at is null");
    expect(migration).toContain("create policy quote_request_attachment_internal_read on storage.objects");
    expect(migration).not.toContain("for select to anon");
  });

  it("persiste throttle por contato e origem antes de gerar a solicitação", () => {
    expect(migration).toContain("private.public_quote_intake_throttles");
    expect(migration).toContain("whatsapp_fingerprint");
    expect(migration).toContain("ip_fingerprint");
    expect(migration).toContain("Recebemos uma solicitação recente deste contato");
    expect(migration).toContain("Recebemos muitas solicitações desta origem");
    expect(migration).toContain("perform private.assert_public_intake_throttle");
  });

  it("impede o envio público de alcançar a demonstração interna", () => {
    expect(migration).toContain("status = 'active' and not is_demo");
  });

  it("revoga execução pública e expõe as operações internas somente ao Service Role", () => {
    expect(migration).toContain("revoke all on function public.public_submit_quote_request");
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
    expect(migration).toContain("O intake público deve ser encaminhado pelo servidor.");
  });
});
