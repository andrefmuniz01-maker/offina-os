export function getInventoryAvailability(available: number, minimum: number) {
  if (available <= 0) return { label: "Indisponível", tone: "critical" as const };
  if (available <= minimum) return { label: "Crítico", tone: "attention" as const };
  return { label: "Disponível", tone: "normal" as const };
}

export function getInventoryTone(tone: "critical" | "attention" | "normal") {
  if (tone === "critical") return "border-red-200 bg-red-50 text-red-800";
  if (tone === "attention") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-emerald-200 bg-emerald-50 text-emerald-800";
}
