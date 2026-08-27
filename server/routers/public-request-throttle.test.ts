import { describe, expect, it } from "vitest";
import { isPublicRequestResubmissionBlocked, PUBLIC_REQUEST_RESUBMISSION_COOLDOWN_MS } from "./quotes";

describe("limitação de reenvio da solicitação pública", () => {
  const now = new Date("2026-08-27T12:00:00.000Z");

  it("bloqueia um novo envio do mesmo contato dentro do intervalo seguro", () => {
    const lastRequest = new Date(now.getTime() - PUBLIC_REQUEST_RESUBMISSION_COOLDOWN_MS + 1);
    expect(isPublicRequestResubmissionBlocked(lastRequest, now)).toBe(true);
  });

  it("permite uma nova solicitação após o intervalo ou quando não há histórico", () => {
    expect(isPublicRequestResubmissionBlocked(new Date(now.getTime() - PUBLIC_REQUEST_RESUBMISSION_COOLDOWN_MS), now)).toBe(false);
    expect(isPublicRequestResubmissionBlocked(undefined, now)).toBe(false);
  });
});
