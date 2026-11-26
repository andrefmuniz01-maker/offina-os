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

  it("informa que depois de aprovar o cliente escolhe o horário e que cobrança é tratada à parte", () => {
    expect(publicQuoteFollowUpNotice).toContain("escolha o dia e o horário");
    expect(publicQuoteFollowUpNotice).toContain("cobrança");
    expect(publicQuoteApprovalBoundary).toContain("escolhe o dia e o horário");
    expect(publicQuoteApprovalBoundary).toContain("Cobrança");
  });
});
