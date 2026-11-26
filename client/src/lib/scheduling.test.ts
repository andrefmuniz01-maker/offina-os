import { describe, expect, it } from "vitest";
import { buildSchedulingMessage, formatDuration, formatSlotDay, pickSuggestedSlots, toDatetimeLocalValue } from "./scheduling";

describe("scheduling", () => {
  it("monta a mensagem de agendamento com o link e só o primeiro nome do cliente", () => {
    const message = buildSchedulingMessage({ customerName: "Maria da Silva", vehicleName: "Corolla", workshopName: "Auto Prime", quoteNumber: 37, link: "https://x.test/agendar/abc" });
    expect(message).toContain("Olá, Maria!");
    expect(message).toContain("Auto Prime");
    expect(message).toContain("#000037");
    expect(message).toContain("Corolla");
    expect(message.endsWith("https://x.test/agendar/abc")).toBe(true);
  });

  it("formata o dia sem deslocar a data por fuso horário", () => {
    expect(formatSlotDay("2026-11-26")).toMatch(/26\/11$/);
    expect(formatSlotDay("2026-12-01")).toMatch(/01\/12$/);
  });

  it("formata a duração em horas e minutos", () => {
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(120)).toBe("2h");
    expect(formatDuration(150)).toBe("2h30");
  });

  it("converte um instante ISO para o valor de datetime-local", () => {
    expect(toDatetimeLocalValue("2026-11-26T12:00:00+00:00")).toMatch(/^2026-11-26T\d{2}:00$/);
  });

  it("sugere os primeiros horários livres em ordem e respeita o limite", () => {
    const days = [
      { date: "2026-11-26", slots: [{ start: "a", label: "08:00" }, { start: "b", label: "09:00" }] },
      { date: "2026-11-27", slots: [{ start: "c", label: "08:00" }, { start: "d", label: "09:00" }] },
    ];
    expect(pickSuggestedSlots(days, 3).map(slot => slot.start)).toEqual(["a", "b", "c"]);
    expect(pickSuggestedSlots([], 3)).toEqual([]);
  });
});
