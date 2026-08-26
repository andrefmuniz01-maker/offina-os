export type PublicQuoteStep = 1 | 2 | 3;

export function getPublicQuoteStepIssue(step: PublicQuoteStep, form: { name: string; whatsapp: string; make: string; model: string }) {
  if (step === 1 && (!form.name.trim() || !form.whatsapp.trim())) return "Informe seu nome e WhatsApp para continuar.";
  if (step === 2 && (!form.make.trim() || !form.model.trim())) return "Informe a marca e o modelo do veículo para continuar.";
  return null;
}
