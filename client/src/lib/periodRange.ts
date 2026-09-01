export type PeriodView = "day" | "week" | "month";

export function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function addMonths(date: Date, months: number) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

export function startOfWeek(date: Date) {
  const d = startOfDay(date);
  const day = d.getDay();
  return addDays(d, day === 0 ? -6 : 1 - day);
}

export function startOfMonth(date: Date) {
  const d = startOfDay(date);
  d.setDate(1);
  return d;
}

const weekdayFormat = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
const monthYearFormat = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });
const shortDateFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });

export function getPeriodRange(view: PeriodView, anchor: Date): { start: Date; end: Date; label: string } {
  if (view === "day") {
    const start = startOfDay(anchor);
    return { start, end: addDays(start, 1), label: capitalize(weekdayFormat.format(start)) };
  }
  if (view === "week") {
    const start = startOfWeek(anchor);
    const end = addDays(start, 7);
    return { start, end, label: `${shortDateFormat.format(start)} – ${shortDateFormat.format(addDays(end, -1))}` };
  }
  const start = startOfMonth(anchor);
  const end = addMonths(start, 1);
  return { start, end, label: capitalize(monthYearFormat.format(start)) };
}

export function navigatePeriod(view: PeriodView, anchor: Date, direction: -1 | 1): Date {
  if (view === "day") return addDays(anchor, direction);
  if (view === "week") return addDays(anchor, direction * 7);
  return addMonths(anchor, direction);
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
