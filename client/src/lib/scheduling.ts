export type SlotDay = { date: string; slots: { start: string; label: string }[] };

/** Mensagem de WhatsApp que a oficina envia para o cliente escolher o horário (proposta já aprovada). */
export function buildSchedulingMessage(input: { customerName: string; vehicleName: string; workshopName: string; quoteNumber: number; link: string }) {
  const firstName = input.customerName.trim().split(/\s+/)[0] || "cliente";
  return [
    `Olá, ${firstName}! Aqui é da ${input.workshopName}.`,
    `Sua proposta #${String(input.quoteNumber).padStart(6, "0")} foi aprovada. Agora é só escolher o melhor dia e horário para trazer o ${input.vehicleName || "veículo"}:`,
    input.link,
  ].join("\n\n");
}

/** Dia no formato "qui, 26/11" a partir da data do calendário (AAAA-MM-DD), sem deslocar por fuso. */
export function formatSlotDay(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const noon = new Date(year, month - 1, day, 12, 0, 0);
  const weekday = new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(noon).replace(".", "");
  return `${weekday}, ${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}`;
}

export function formatSlotDayLong(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(new Date(year, month - 1, day, 12, 0, 0));
}

/** Horário de Brasília (fuso da oficina) a partir de um instante ISO. */
export function formatShopDateTime(iso: string) {
  const date = new Date(iso);
  const day = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Sao_Paulo" }).format(date);
  const time = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(date);
  return { day, time };
}

export function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} min`;
  return rest ? `${hours}h${String(rest).padStart(2, "0")}` : `${hours}h`;
}

/** Valor para <input type="datetime-local"> no fuso do navegador. */
export function toDatetimeLocalValue(iso: string) {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Primeiros horários livres em ordem, para sugerir à equipe sem mostrar a agenda inteira. */
export function pickSuggestedSlots(days: SlotDay[], limit = 6) {
  const result: { start: string; date: string; label: string }[] = [];
  for (const day of days) {
    for (const slot of day.slots) {
      result.push({ start: slot.start, date: day.date, label: slot.label });
      if (result.length >= limit) return result;
    }
  }
  return result;
}
