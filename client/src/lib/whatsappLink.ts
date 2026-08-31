export function normalizeWhatsappForLink(rawWhatsapp: string) {
  const digits = rawWhatsapp.replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

export function renderQuoteMessageTemplate(template: string, values: { client: string; vehicle: string; total: string; link: string; workshop: string }) {
  return template
    .replaceAll("{{cliente}}", values.client)
    .replaceAll("{{veiculo}}", values.vehicle)
    .replaceAll("{{total}}", values.total)
    .replaceAll("{{link}}", values.link)
    .replaceAll("{{oficina}}", values.workshop);
}

export function buildWhatsappLink(whatsapp: string, message: string) {
  const normalized = normalizeWhatsappForLink(whatsapp);
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}
