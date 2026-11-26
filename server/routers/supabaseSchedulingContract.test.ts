import { describe, expect, it } from "vitest";
import { publicBookingResultSchema, publicSchedulingInfoSchema, workspaceAvailableSlotsSchema, workspaceSchedulingLinkSchema } from "./supabaseSchedulingContract";

const days = [{ date: "2026-11-26", slots: [{ start: "2026-11-26T11:00:00+00:00", label: "08:00" }, { start: "2026-11-26T12:00:00+00:00", label: "09:00" }] }];

describe("contratos de agendamento", () => {
  it("aceita a resposta de horários livres do cliente (estado aberto)", () => {
    const parsed = publicSchedulingInfoSchema.safeParse({ state: "open", workshopName: "Auto Prime", quoteNumber: 37, vehicleName: "Corolla", firstName: "Maria", durationMinutes: 120, days });
    expect(parsed.success).toBe(true);
  });

  it("aceita o estado já agendado e recusa campos extras ou estados desconhecidos", () => {
    const scheduled = { state: "scheduled", workshopName: "Auto Prime", quoteNumber: 37, vehicleName: "Corolla", firstName: "Maria", scheduledStart: "2026-11-26T12:00:00+00:00", scheduledEnd: "2026-11-26T14:00:00+00:00" };
    expect(publicSchedulingInfoSchema.safeParse(scheduled).success).toBe(true);
    expect(publicSchedulingInfoSchema.safeParse({ ...scheduled, extra: 1 }).success).toBe(false);
    expect(publicSchedulingInfoSchema.safeParse({ ...scheduled, state: "cancelled" }).success).toBe(false);
  });

  it("recusa dia sem horários ou horário com rótulo inválido", () => {
    expect(workspaceAvailableSlotsSchema.safeParse({ durationMinutes: 60, days: [{ date: "2026-11-26", slots: [] }] }).success).toBe(false);
    expect(workspaceAvailableSlotsSchema.safeParse({ durationMinutes: 60, days: [{ date: "2026-11-26", slots: [{ start: "2026-11-26T11:00:00+00:00", label: "8h" }] }] }).success).toBe(false);
  });

  it("valida o resultado do agendamento e o link da equipe", () => {
    expect(publicBookingResultSchema.safeParse({ appointmentId: 1, workOrderNumber: 22, scheduledStart: "2026-11-26T12:00:00+00:00", scheduledEnd: "2026-11-26T14:00:00+00:00" }).success).toBe(true);
    expect(workspaceSchedulingLinkSchema.safeParse({ quoteNumber: 37, publicToken: "a".repeat(64), customerName: "Maria", customerWhatsapp: "11999998888", vehicleName: "Corolla", workshopName: "Auto Prime", alreadyScheduled: false }).success).toBe(true);
    expect(workspaceSchedulingLinkSchema.safeParse({ quoteNumber: 37, publicToken: "curto", customerName: "Maria", customerWhatsapp: "1", vehicleName: "", workshopName: "A", alreadyScheduled: false }).success).toBe(false);
  });
});
