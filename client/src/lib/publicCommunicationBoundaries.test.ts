import { describe, expect, it } from "vitest";
import {
  publicQuoteApprovalBoundary,
  publicQuoteFollowUpNotice,
  publicRequestConfirmationNotice,
  publicRequestContactNotice,
} from "./publicCommunicationBoundaries";

describe("limites de comunicação pública", () => {
  it("informa que a solicitação não envia WhatsApp automaticamente", () => {
    expect(publicRequestContactNotice).toContain("contato manual");
    expect(publicRequestContactNotice).toContain("não envia mensagens automáticas");
    expect(publicRequestConfirmationNotice).toContain("Nenhuma cobrança ou aprovação");
  });

  it("informa que decisão de proposta não cria comunicação, agenda ou cobrança automaticamente", () => {
    expect(publicQuoteFollowUpNotice).toContain("sem mensagem automática");
    expect(publicQuoteApprovalBoundary).toContain("Agenda, ordem de serviço, cobrança");
  });
});
