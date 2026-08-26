export function getQuoteValidity(validUntil: Date | string, now = new Date()) {
  const deadline = new Date(validUntil);
  const days = Math.ceil((deadline.getTime() - now.getTime()) / 86_400_000);
  const sameDay = deadline.getFullYear() === now.getFullYear() && deadline.getMonth() === now.getMonth() && deadline.getDate() === now.getDate();
  if (days <= 0 || sameDay) return { label: "Vence hoje", tone: "urgent" as const };
  if (days <= 3) return { label: `Válido por ${days} dia${days === 1 ? "" : "s"}`, tone: "attention" as const };
  return { label: `Válido até ${new Date(validUntil).toLocaleDateString("pt-BR")}`, tone: "normal" as const };
}
