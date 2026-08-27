import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { validatePublicRequestAttachments } from "@/lib/publicRequestAttachments";
import { getPublicQuoteStepIssue, type PublicQuoteStep } from "@/lib/publicQuoteFlow";
import { supabase } from "@/lib/supabase";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, CircleAlert, FileImage, Loader2, Send, ShieldCheck, Wrench } from "lucide-react";
import { useMemo, useState } from "react";
import { useRoute } from "wouter";
import { SafeLink as Link } from "@/components/SafeLink";

const steps = [{ id: 1 as const, label: "Contato" }, { id: 2 as const, label: "Veículo" }, { id: 3 as const, label: "Necessidade" }];

function attachmentKey(capability: string, slot: number) {
  return `requests/${capability}/${String(slot).padStart(2, "0")}`;
}

function userFacingError(error: unknown) {
  return error instanceof Error && error.message ? error.message : "Não foi possível concluir sua solicitação agora. Tente novamente em alguns minutos.";
}

export default function PublicQuoteRequest() {
  const [, params] = useRoute("/solicitar/:slug");
  const slug = params?.slug ?? "";
  const catalog = trpc.publicIntake.catalog.useQuery({ tenantSlug: slug }, { enabled: Boolean(slug) });
  const createRequest = trpc.publicIntake.create.useMutation();
  const finalizeAttachments = trpc.publicIntake.finalizeAttachments.useMutation();
  const [step, setStep] = useState<PublicQuoteStep>(1);
  const [stepIssue, setStepIssue] = useState<string | null>(null);
  const [serviceId, setServiceId] = useState<number | undefined>();
  const [form, setForm] = useState({ name: "", whatsapp: "", email: "", make: "", model: "", modelYear: "", plate: "", mileage: "", description: "" });
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [requestNumber, setRequestNumber] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const selectedService = useMemo(() => catalog.data?.services.find(service => service.id === serviceId), [catalog.data, serviceId]);
  const update = (key: keyof typeof form, value: string) => setForm(current => ({ ...current, [key]: value }));
  const updateAttachments = (files: File[]) => {
    const validation = validatePublicRequestAttachments(files);
    if (!validation.ok) { setAttachedFiles([]); setStepIssue(validation.message); return; }
    setStepIssue(null);
    setAttachedFiles(files);
  };

  if (catalog.isLoading) return <main className="min-h-screen bg-stone-50 p-6"><div className="mx-auto max-w-xl animate-pulse rounded-2xl bg-white p-8">Preparando o formulário…</div></main>;
  if (catalog.error || !catalog.data) return <main className="grid min-h-screen place-items-center bg-stone-50 p-6"><Card className="w-full max-w-md"><CardHeader><CircleAlert className="h-8 w-8 text-red-600" /><CardTitle>Link indisponível</CardTitle><CardDescription>Esta oficina não está disponível para receber solicitações neste momento.</CardDescription></CardHeader></Card></main>;

  const branding = catalog.data.workshop.branding;
  const primaryColor = branding?.primaryColor ?? "#E84D1C";
  const secondaryColor = branding?.secondaryColor ?? "#171717";
  const accentColor = branding?.accentColor ?? "#F5B33A";
  const publicTitle = branding?.publicTitle || catalog.data.workshop.name;
  const goForward = () => {
    const issue = getPublicQuoteStepIssue(step, form);
    if (issue) return setStepIssue(issue);
    setStepIssue(null);
    setStep(current => Math.min(3, current + 1) as PublicQuoteStep);
  };
  const send = async () => {
    const requiredQuestion = selectedService?.quoteQuestions?.find(question => question.required && !answers[question.id]?.trim());
    if (requiredQuestion) return setStepIssue(`Responda “${requiredQuestion.label}” para enviar.`);
    const validation = validatePublicRequestAttachments(attachedFiles);
    if (!validation.ok) return setStepIssue(validation.message);
    setSubmitting(true);
    setStepIssue(null);
    try {
      const result = await createRequest.mutateAsync({
        tenantSlug: slug, name: form.name, whatsapp: form.whatsapp, email: form.email || undefined,
        make: form.make, model: form.model, modelYear: form.modelYear ? Number(form.modelYear) : undefined,
        plate: form.plate || undefined, mileage: form.mileage ? Number(form.mileage) : undefined,
        serviceId, serviceLabel: selectedService?.name ?? "Serviço personalizado", description: form.description || undefined,
        answers, attachments: attachedFiles.map((file, index) => ({ slot: index + 1, filename: file.name, mimeType: file.type as "image/jpeg" | "image/png" | "image/webp" | "image/gif" | "video/mp4" | "video/webm" | "video/quicktime", sizeBytes: file.size })),
      });
      if (attachedFiles.length && !result.uploadCapability) throw new Error("Não foi possível preparar o recebimento seguro dos anexos.");
      if (result.uploadCapability) {
        for (let index = 0; index < attachedFiles.length; index += 1) {
          const file = attachedFiles[index];
          const { error } = await supabase.storage.from("quote-request-attachments").upload(attachmentKey(result.uploadCapability, index + 1), file, { contentType: file.type, upsert: false });
          if (error) throw new Error("Não foi possível enviar um dos anexos com segurança. A solicitação foi registrada sem concluir os arquivos.");
        }
        await finalizeAttachments.mutateAsync({ uploadCapability: result.uploadCapability, files: attachedFiles.map((file, index) => ({ slot: index + 1, filename: file.name })) });
      }
      setRequestNumber(result.requestNumber);
    } catch (error) {
      setStepIssue(userFacingError(error));
    } finally {
      setSubmitting(false);
    }
  };

  if (requestNumber !== null) return <main className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_top_right,rgba(251,146,60,.18),transparent_34%),#f8fafc] p-6"><Card className="max-w-lg border-orange-100 shadow-xl"><CardContent className="p-8 text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-emerald-700"><CheckCircle2 className="h-8 w-8" /></div><Badge className="mt-5 bg-emerald-50 text-emerald-800 hover:bg-emerald-50">Solicitação enviada</Badge><h1 className="mt-3 text-2xl font-bold text-slate-950">Recebemos os detalhes do seu veículo</h1><p className="mt-3 text-slate-600">A {catalog.data.workshop.name} avaliará sua necessidade e fará o contato pelo WhatsApp informado. Nenhuma cobrança ou aprovação foi realizada nesta etapa.</p><p className="mt-5 text-sm font-semibold text-slate-700">Protocolo #{String(requestNumber).padStart(6, "0")}</p></CardContent></Card></main>;

  return <main className="min-h-screen bg-[radial-gradient(circle_at_90%_-5%,rgba(251,146,60,.17),transparent_28%),#fafaf9] px-4 py-8 sm:p-10"><div className="mx-auto max-w-3xl"><Link href="/"><a className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900"><ArrowLeft className="h-4 w-4" />{publicTitle}</a></Link><header className="mt-7 rounded-2xl px-6 py-8 text-white shadow-[0_25px_80px_-35px_rgba(15,23,42,.65)] sm:px-9" style={{ backgroundColor: secondaryColor }}><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl" style={{ backgroundColor: primaryColor }}><Wrench className="h-5 w-5" /></div><span className="text-sm font-semibold uppercase tracking-[.14em]" style={{ color: accentColor }}>Solicitação de orçamento</span></div><h1 className="mt-5 text-3xl font-semibold tracking-tight">Vamos entender o seu veículo</h1><p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">Leva poucos minutos. Primeiro coletamos o contato, depois o veículo e, por fim, os detalhes do serviço.</p></header><Card className="mt-6 border-stone-200 shadow-[0_15px_45px_-32px_rgba(15,23,42,.35)]"><CardContent className="p-6 sm:p-8"><div className="mb-8 grid grid-cols-3 gap-2" aria-label="Etapas da solicitação">{steps.map(item => <div key={item.id} className={`rounded-xl border px-3 py-3 text-center ${step === item.id ? "border-orange-200 bg-orange-50" : step > item.id ? "border-emerald-100 bg-emerald-50" : "border-stone-100 bg-stone-50"}`}><div className={`mx-auto grid h-6 w-6 place-items-center rounded-full text-xs font-bold ${step > item.id ? "bg-emerald-600 text-white" : step === item.id ? "text-white" : "bg-stone-200 text-stone-600"}`} style={step === item.id ? { backgroundColor: primaryColor } : undefined}>{step > item.id ? <Check className="h-3.5 w-3.5" /> : item.id}</div><p className="mt-2 text-xs font-semibold text-slate-700">{item.label}</p></div>)}</div>
    {step === 1 ? <section><p className="text-xs font-semibold uppercase tracking-[.14em] text-orange-700">Etapa 1 de 3</p><h2 className="mt-1 text-xl font-semibold text-slate-950">Como podemos falar com você?</h2><p className="mt-1 text-sm text-slate-500">Usaremos o WhatsApp apenas para acompanhar a análise do pedido.</p><div className="mt-5 grid gap-4 sm:grid-cols-2"><div className="grid gap-2 sm:col-span-2"><Label htmlFor="public-name">Nome completo</Label><Input id="public-name" value={form.name} onChange={event => update("name", event.target.value)} placeholder="Como podemos chamar você?" autoComplete="name" /></div><div className="grid gap-2"><Label htmlFor="public-whatsapp">WhatsApp</Label><Input id="public-whatsapp" value={form.whatsapp} onChange={event => update("whatsapp", event.target.value)} placeholder="(11) 99999-9999" inputMode="tel" autoComplete="tel" /></div><div className="grid gap-2"><Label htmlFor="public-email">E-mail <span className="font-normal text-slate-400">(opcional)</span></Label><Input id="public-email" type="email" value={form.email} onChange={event => update("email", event.target.value)} placeholder="voce@email.com" autoComplete="email" /></div></div></section> : null}
    {step === 2 ? <section><p className="text-xs font-semibold uppercase tracking-[.14em] text-orange-700">Etapa 2 de 3</p><h2 className="mt-1 text-xl font-semibold text-slate-950">Qual é o seu veículo?</h2><p className="mt-1 text-sm text-slate-500">Esses dados ajudam a equipe a avaliar compatibilidade e disponibilidade.</p><div className="mt-5 grid gap-4 sm:grid-cols-2"><div className="grid gap-2"><Label htmlFor="public-make">Marca</Label><Input id="public-make" value={form.make} onChange={event => update("make", event.target.value)} placeholder="Ex.: BMW" /></div><div className="grid gap-2"><Label htmlFor="public-model">Modelo</Label><Input id="public-model" value={form.model} onChange={event => update("model", event.target.value)} placeholder="Ex.: 320i" /></div><div className="grid gap-2"><Label htmlFor="public-year">Ano <span className="font-normal text-slate-400">(opcional)</span></Label><Input id="public-year" inputMode="numeric" value={form.modelYear} onChange={event => update("modelYear", event.target.value)} placeholder="Ex.: 2021" /></div><div className="grid gap-2"><Label htmlFor="public-plate">Placa <span className="font-normal text-slate-400">(opcional)</span></Label><Input id="public-plate" value={form.plate} onChange={event => update("plate", event.target.value)} placeholder="ABC1D23" /></div></div></section> : null}
    {step === 3 ? <section><p className="text-xs font-semibold uppercase tracking-[.14em] text-orange-700">Etapa 3 de 3</p><h2 className="mt-1 text-xl font-semibold text-slate-950">Conte o que você precisa</h2><p className="mt-1 text-sm text-slate-500">Você pode escolher um serviço ou explicar livremente. A equipe confirmará todos os detalhes antes do orçamento.</p><div className="mt-5 grid gap-4"><div className="grid gap-2"><Label htmlFor="public-service">Serviço desejado</Label><select id="public-service" className="h-10 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs" value={serviceId ?? ""} onChange={event => { setServiceId(event.target.value ? Number(event.target.value) : undefined); setAnswers({}); }}><option value="">Serviço personalizado ou ainda não definido</option>{catalog.data.services.map(service => <option key={service.id} value={service.id}>{service.name}</option>)}</select></div>{selectedService?.quoteQuestions?.map(question => <div className="grid gap-2" key={question.id}><Label htmlFor={`public-question-${question.id}`}>{question.label}{question.required ? " *" : ""}</Label>{question.options?.length ? <select id={`public-question-${question.id}`} className="h-10 rounded-md border border-input bg-transparent px-3 text-sm" value={answers[question.id] ?? ""} onChange={event => setAnswers(current => ({ ...current, [question.id]: event.target.value }))}><option value="">Selecione</option>{question.options.map(option => <option key={option} value={option}>{option}</option>)}</select> : <Input id={`public-question-${question.id}`} value={answers[question.id] ?? ""} onChange={event => setAnswers(current => ({ ...current, [question.id]: event.target.value }))} />}</div>)}<div className="grid gap-2"><Label htmlFor="public-description">Detalhes do serviço <span className="font-normal text-slate-400">(opcional)</span></Label><Textarea id="public-description" value={form.description} onChange={event => update("description", event.target.value)} placeholder="Descreva sua necessidade, preferências e qualquer detalhe relevante." rows={5} /></div><div className="rounded-xl border border-dashed border-stone-200 bg-stone-50 p-4"><div className="flex items-start gap-3"><FileImage className="mt-0.5 h-5 w-5 text-orange-700" /><div className="min-w-0"><Label htmlFor="request-files">Fotos ou vídeos <span className="font-normal text-slate-400">(até 5 arquivos de 5 MB cada)</span></Label><p className="mt-1 text-xs text-slate-500">Os arquivos vão diretamente para armazenamento privado e não ficam públicos.</p><Input id="request-files" className="mt-3 bg-white" type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime" multiple onChange={event => updateAttachments(Array.from(event.target.files ?? []))} /><p className="mt-2 text-xs font-medium text-slate-600">{attachedFiles.length ? `${attachedFiles.length} arquivo(s) selecionado(s).` : "Nenhum arquivo selecionado."}</p></div></div></div></div></section> : null}
    {stepIssue ? <p className="mt-6 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{stepIssue}</p> : null}<div className="mt-8 flex flex-col-reverse gap-3 border-t border-stone-100 pt-6 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2 text-xs text-slate-500"><ShieldCheck className="h-4 w-4 text-emerald-700" />Dados usados somente para analisar a solicitação.</div><div className="flex gap-2">{step > 1 ? <Button type="button" variant="outline" disabled={submitting} onClick={() => { setStepIssue(null); setStep(current => (current - 1) as PublicQuoteStep); }}>Voltar</Button> : null}{step < 3 ? <Button type="button" style={{ backgroundColor: primaryColor }} disabled={submitting} onClick={goForward}>Continuar<ArrowRight className="ml-2 h-4 w-4" /></Button> : <Button type="button" style={{ backgroundColor: primaryColor }} disabled={submitting} onClick={send}>{submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}{submitting ? "Enviando…" : "Enviar solicitação"}</Button>}</div></div></CardContent></Card></div></main>;
}
