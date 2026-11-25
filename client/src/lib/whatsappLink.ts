export function normalizeWhatsappForLink(rawWhatsapp: string) {
  const digits = rawWhatsapp.replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

/**
 * Monta a mensagem da proposta e GARANTE que o link vá junto. Se o modelo da oficina
 * não tiver o campo {{link}} (ou o texto foi editado e o campo se perdeu), o link é
 * acrescentado no final: o cliente nunca recebe a mensagem sem o endereço da proposta.
 */
export function renderQuoteMessageTemplate(template: string, values: { client: string; vehicle: string; total: string; link: string; workshop: string }) {
  const message = template
    .replaceAll("{{cliente}}", values.client)
    .replaceAll("{{veiculo}}", values.vehicle)
    .replaceAll("{{total}}", values.total)
    .replaceAll("{{link}}", values.link)
    .replaceAll("{{oficina}}", values.workshop)
    .trim();
  return message.includes(values.link) ? message : `${message}\n\nVeja e aprove sua proposta aqui: ${values.link}`;
}

export function buildWhatsappLink(whatsapp: string, message: string) {
  const normalized = normalizeWhatsappForLink(whatsapp);
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}
