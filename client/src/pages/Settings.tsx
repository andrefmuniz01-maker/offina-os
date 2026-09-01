import DashboardLayout, { type DashboardMenuItem } from "@/components/DashboardLayout";
import { SafeLink as Link } from "@/components/SafeLink";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { isDemoWorkspace, selectWorkspace } from "@/lib/demoWorkspace";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, DoorOpen, Plus, Save, Settings2, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const weekdays: Array<{ key: "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday"; label: string }> = [
  { key: "monday", label: "Segunda" },
  { key: "tuesday", label: "Terça" },
  { key: "wednesday", label: "Quarta" },
  { key: "thursday", label: "Quinta" },
  { key: "friday", label: "Sexta" },
  { key: "saturday", label: "Sábado" },
  { key: "sunday", label: "Domingo" },
];
type DayHours = { closed?: boolean; open?: string; close?: string };
type OpeningHoursForm = Partial<Record<typeof weekdays[number]["key"], DayHours>>;

function BusinessHoursSection({ tenantId }: { tenantId: number }) {
  const settings = trpc.workspaceManagement.settings.get.useQuery({ tenantId }, { enabled: Boolean(tenantId) });
  const utils = trpc.useUtils();
  const [hours, setHours] = useState<OpeningHoursForm>({});
  useEffect(() => { if (settings.data) setHours((settings.data.openingHours as OpeningHoursForm) ?? {}); }, [settings.data]);
  const update = trpc.workspaceManagement.settings.update.useMutation({
    onSuccess: () => { toast.success("Horário de funcionamento salvo."); utils.workspaceManagement.settings.get.invalidate({ tenantId }); },
    onError: error => toast.error(error.message),
  });
  const setDay = (key: typeof weekdays[number]["key"], patch: Partial<DayHours>) => setHours(current => ({ ...current, [key]: { ...current[key], ...patch } }));
  const save = () => {
    if (!settings.data) return;
    update.mutate({ tenantId, legalName: settings.data.legalName, document: settings.data.document, phone: settings.data.phone, whatsapp: settings.data.whatsapp, email: settings.data.email, defaultLaborHourlyRate: settings.data.defaultLaborHourlyRate, defaultPartsMarginPercent: settings.data.defaultPartsMarginPercent, defaultPartsMarkupPercent: settings.data.defaultPartsMarkupPercent, quoteValidityDays: settings.data.quoteValidityDays, minimumMarginPercent: settings.data.minimumMarginPercent, attendantMaxDiscountPercent: settings.data.attendantMaxDiscountPercent, quoteMessageTemplate: settings.data.quoteMessageTemplate, openingHours: hours });
  };
  if (settings.isLoading) return <Skeleton className="h-48" />;
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {weekdays.map(day => {
          const config = hours[day.key] ?? {};
          const closed = config.closed === true;
          return (
            <div key={day.key} className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 p-3">
              <span className="w-20 text-sm font-medium text-slate-700">{day.label}</span>
              <div className="flex items-center gap-2"><Switch checked={!closed} onCheckedChange={checked => setDay(day.key, { closed: !checked })} aria-label={`${day.label} aberto`} /><span className="text-xs text-slate-500">{closed ? "Fechado" : "Aberto"}</span></div>
              {!closed ? <div className="flex items-center gap-2"><Input type="time" className="w-28" value={config.open ?? ""} onChange={event => setDay(day.key, { open: event.target.value })} aria-label={`Abertura de ${day.label}`} /><span className="text-xs text-slate-400">até</span><Input type="time" className="w-28" value={config.close ?? ""} onChange={event => setDay(day.key, { close: event.target.value })} aria-label={`Fechamento de ${day.label}`} /></div> : null}
            </div>
          );
        })}
      </div>
      <Button type="button" size="sm" onClick={save} disabled={update.isPending}><Save className="mr-2 h-3.5 w-3.5" />{update.isPending ? "Salvando…" : "Salvar horário"}</Button>
    </div>
  );
}

function BaysSection({ tenantId }: { tenantId: number }) {
  const bays = trpc.workspaceManagement.bays.list.useQuery({ tenantId }, { enabled: Boolean(tenantId) });
  const utils = trpc.useUtils();
  const [newBayName, setNewBayName] = useState("");
  const invalidate = () => utils.workspaceManagement.bays.list.invalidate({ tenantId });
  const upsert = trpc.workspaceManagement.bays.upsert.useMutation({ onSuccess: () => { setNewBayName(""); invalidate(); }, onError: error => toast.error(error.message) });
  const remove = trpc.workspaceManagement.bays.remove.useMutation({ onSuccess: () => { toast.success("Baia removida."); invalidate(); }, onError: error => toast.error(error.message) });
  const addBay = () => { if (!newBayName.trim()) return; upsert.mutate({ tenantId, name: newBayName.trim(), sortOrder: bays.data?.length ?? 0 }); };
  if (bays.isLoading) return <Skeleton className="h-32" />;
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {(bays.data ?? []).filter(bay => bay.active).map(bay => (
          <div key={bay.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3">
            <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-800"><DoorOpen className="h-4 w-4 text-orange-700" />{bay.name}</span>
            <Button type="button" size="sm" variant="ghost" onClick={() => remove.mutate({ tenantId, bayId: bay.id })} disabled={remove.isPending} aria-label={`Remover ${bay.name}`}><Trash2 className="h-4 w-4 text-red-600" /></Button>
          </div>
        ))}
        {!bays.data?.some(bay => bay.active) ? <p className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">Nenhuma baia cadastrada ainda. A agenda precisa de ao menos uma para calcular horários disponíveis.</p> : null}
      </div>
      <div className="flex gap-2"><Input placeholder="Ex.: Baia 1, Elevador 2" value={newBayName} onChange={event => setNewBayName(event.target.value)} onKeyDown={event => { if (event.key === "Enter") addBay(); }} /><Button type="button" onClick={addBay} disabled={upsert.isPending || !newBayName.trim()}><Plus className="mr-1.5 h-4 w-4" />Adicionar</Button></div>
    </div>
  );
}

const menu: DashboardMenuItem[] = [{ icon: ArrowLeft, label: "Visão geral", path: "/" }, { icon: Settings2, label: "Configurações", path: "/configuracoes" }];
type Form = { legalName: string; document: string; phone: string; whatsapp: string; email: string; defaultLaborHourlyRate: string; defaultPartsMarginPercent: string; defaultPartsMarkupPercent: string; quoteValidityDays: string; minimumMarginPercent: string; attendantMaxDiscountPercent: string; quoteMessageTemplate: string; publicTitle: string; primaryColor: string; secondaryColor: string; accentColor: string };
const initialForm: Form = { legalName: "", document: "", phone: "", whatsapp: "", email: "", defaultLaborHourlyRate: "0", defaultPartsMarginPercent: "0", defaultPartsMarkupPercent: "0", quoteValidityDays: "7", minimumMarginPercent: "0", attendantMaxDiscountPercent: "0", quoteMessageTemplate: "", publicTitle: "", primaryColor: "#E84D1C", secondaryColor: "#171717", accentColor: "#F5B33A" };

function SettingsSection({ id, title, description, children }: { id: string; title: string; description: string; children: React.ReactNode }) {
  return <Card id={id} className="scroll-mt-6 border-slate-200 shadow-none"><CardHeader className="border-b border-slate-100 pb-5"><CardTitle className="text-base font-semibold text-slate-950">{title}</CardTitle><CardDescription className="max-w-2xl leading-6">{description}</CardDescription></CardHeader><CardContent className="p-5 sm:p-6">{children}</CardContent></Card>;
}

export default function Settings() {
  const demoMode = isDemoWorkspace();
  const legacyMine = trpc.tenant.mine.useQuery(undefined, { enabled: !demoMode });
  const workspaceMine = trpc.workspace.mine.useQuery(undefined, { enabled: demoMode });
  const tenant = demoMode ? selectWorkspace(workspaceMine.data, true)?.tenant : legacyMine.data?.[0]?.tenant;
  const tenantId = tenant?.id ?? 0;
  const legacySettings = trpc.tenant.settings.get.useQuery({ tenantId }, { enabled: Boolean(tenantId) && !demoMode });
  const demoSettings = trpc.workspaceManagement.settings.get.useQuery({ tenantId }, { enabled: Boolean(tenantId) && demoMode });
  const settings = demoMode ? demoSettings : legacySettings;
  const legacyBranding = trpc.tenant.branding.get.useQuery({ tenantId }, { enabled: Boolean(tenantId) && !demoMode });
  const demoBranding = trpc.workspaceManagement.branding.get.useQuery({ tenantId }, { enabled: Boolean(tenantId) && demoMode });
  const branding = demoMode ? demoBranding : legacyBranding;
  const [form, setForm] = useState<Form>(initialForm);
  const utils = trpc.useUtils();
  const tenantLoading = demoMode ? workspaceMine.isLoading : legacyMine.isLoading;
  useEffect(() => { if (settings.data || branding.data) setForm({ legalName: settings.data?.legalName ?? "", document: settings.data?.document ?? "", phone: settings.data?.phone ?? "", whatsapp: settings.data?.whatsapp ?? "", email: settings.data?.email ?? "", defaultLaborHourlyRate: String(settings.data?.defaultLaborHourlyRate ?? 0), defaultPartsMarginPercent: String(settings.data?.defaultPartsMarginPercent ?? 0), defaultPartsMarkupPercent: String(settings.data?.defaultPartsMarkupPercent ?? 0), quoteValidityDays: String(settings.data?.quoteValidityDays ?? 7), minimumMarginPercent: String(settings.data?.minimumMarginPercent ?? 0), attendantMaxDiscountPercent: String(settings.data?.attendantMaxDiscountPercent ?? 0), quoteMessageTemplate: settings.data?.quoteMessageTemplate ?? "", publicTitle: branding.data?.publicTitle ?? "", primaryColor: branding.data?.primaryColor ?? "#E84D1C", secondaryColor: branding.data?.secondaryColor ?? "#171717", accentColor: branding.data?.accentColor ?? "#F5B33A" }); }, [settings.data, branding.data]);
  const legacyUpdateSettings = trpc.tenant.settings.update.useMutation({ onSuccess: () => utils.tenant.settings.get.invalidate(), onError: error => toast.error(error.message) });
  const demoUpdateSettings = trpc.workspaceManagement.settings.update.useMutation({ onSuccess: () => utils.workspaceManagement.settings.get.invalidate(), onError: error => toast.error(error.message) });
  const updateSettings = demoMode ? demoUpdateSettings : legacyUpdateSettings;
  const legacyUpdateBranding = trpc.tenant.branding.update.useMutation({ onSuccess: () => utils.tenant.branding.get.invalidate(), onError: error => toast.error(error.message) });
  const demoUpdateBranding = trpc.workspaceManagement.branding.update.useMutation({ onSuccess: () => utils.workspaceManagement.branding.get.invalidate(), onError: error => toast.error(error.message) });
  const updateBranding = demoMode ? demoUpdateBranding : legacyUpdateBranding;
  const isSaving = updateSettings.isPending || updateBranding.isPending;
  const field = (key: keyof Form, label: string, type = "text", props: Record<string, string> = {}) => <div className="grid gap-2"><Label htmlFor={key}>{label}</Label><Input id={key} type={type} value={form[key]} onChange={event => setForm(current => ({ ...current, [key]: event.target.value }))} {...props} /></div>;
  const save = async () => { if (!tenant) return; try { await updateSettings.mutateAsync({ tenantId: tenant.id, legalName: form.legalName || null, document: form.document || null, phone: form.phone || null, whatsapp: form.whatsapp || null, email: form.email || null, defaultLaborHourlyRate: Number(form.defaultLaborHourlyRate), defaultPartsMarginPercent: Number(form.defaultPartsMarginPercent), defaultPartsMarkupPercent: Number(form.defaultPartsMarkupPercent), quoteValidityDays: Number(form.quoteValidityDays), minimumMarginPercent: Number(form.minimumMarginPercent), attendantMaxDiscountPercent: Number(form.attendantMaxDiscountPercent), quoteMessageTemplate: form.quoteMessageTemplate || null }); await updateBranding.mutateAsync({ tenantId: tenant.id, publicTitle: form.publicTitle || null, primaryColor: form.primaryColor, secondaryColor: form.secondaryColor, accentColor: form.accentColor }); toast.success("Configurações salvas."); } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível salvar."); } };

  if (tenantLoading || settings.isLoading || branding.isLoading) return <DashboardLayout menuItems={menu} workspaceName={tenant?.name ?? "OficinaOS"}><main className="mx-auto max-w-5xl"><Skeleton className="h-96" /></main></DashboardLayout>;
  if (legacyMine.isError || workspaceMine.isError || settings.isError || branding.isError) return <DashboardLayout menuItems={menu} workspaceName={tenant?.name ?? "OficinaOS"}><main className="mx-auto max-w-5xl"><Card className="border-red-200 bg-red-50 shadow-none"><CardHeader><CardTitle>Não foi possível carregar as configurações</CardTitle><CardDescription>Verifique sua conexão ou tente novamente. Nenhuma alteração foi aplicada.</CardDescription></CardHeader><CardContent><Button variant="outline" onClick={() => { legacyMine.refetch(); workspaceMine.refetch(); settings.refetch(); branding.refetch(); }}>Tentar novamente</Button></CardContent></Card></main></DashboardLayout>;
  if (!tenant) return <DashboardLayout menuItems={menu} workspaceName="OficinaOS"><main className="mx-auto max-w-5xl space-y-7"><header className="border-b border-slate-200 pb-6"><Link href="/"><a className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900"><ArrowLeft className="h-3.5 w-3.5" />Visão geral</a></Link><h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Configurações da oficina</h1></header><Card className="border-dashed border-slate-300"><CardContent className="p-8 text-center text-sm text-slate-600">Seu acesso ainda não está vinculado a uma oficina. Peça a um Super Admin para associá-lo ao tenant correto antes de alterar configurações administrativas.</CardContent></Card></main></DashboardLayout>;

  return <DashboardLayout menuItems={menu} workspaceName={tenant.name}><main className="mx-auto max-w-5xl space-y-6"><header className="border-b border-slate-200 pb-6"><Link href="/"><a className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900"><ArrowLeft className="h-3.5 w-3.5" />Visão geral</a></Link><div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-3xl font-semibold tracking-tight text-slate-950">Configurações da oficina</h1><p className="mt-1 text-sm text-slate-500">Defina dados institucionais, regras de orçamento e identidade pública.</p></div><Button onClick={save} disabled={isSaving}><Save className="mr-2 h-4 w-4" />{isSaving ? "Salvando…" : "Salvar alterações"}</Button></div></header><nav aria-label="Seções de configurações" className="flex flex-wrap gap-x-5 gap-y-2 border-b border-slate-100 pb-4 text-sm"><a href="#dados" className="font-medium text-slate-700 hover:text-slate-950">Dados da oficina</a><a href="#comercial" className="font-medium text-slate-700 hover:text-slate-950">Regras comerciais</a><a href="#horario" className="font-medium text-slate-700 hover:text-slate-950">Horário de funcionamento</a><a href="#baias" className="font-medium text-slate-700 hover:text-slate-950">Baias e capacidade</a><a href="#mensagem" className="font-medium text-slate-700 hover:text-slate-950">Mensagem</a><a href="#publico" className="font-medium text-slate-700 hover:text-slate-950">Página pública</a></nav><SettingsSection id="dados" title="Dados da oficina" description="Informações institucionais usadas na identificação e no relacionamento comercial."><div className="grid gap-4 sm:grid-cols-2">{field("legalName", "Razão social", "text", { placeholder: tenant.name })}{field("document", "CNPJ / documento")}{field("phone", "Telefone")}{field("whatsapp", "WhatsApp")}{field("email", "E-mail", "email")}</div></SettingsSection><SettingsSection id="comercial" title="Regras comerciais" description="Parâmetros aplicados como referência em preços e orçamentos. Margem padrão prevalece sobre markup quando ambos estiverem definidos."><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{field("defaultLaborHourlyRate", "Hora padrão (R$)", "number", { min: "0", step: "0.01" })}{field("defaultPartsMarginPercent", "Margem padrão de peças (%)", "number", { min: "0", max: "99.99", step: "0.01" })}{field("defaultPartsMarkupPercent", "Markup padrão de peças (%)", "number", { min: "0", max: "1000", step: "0.01" })}{field("quoteValidityDays", "Validade do orçamento (dias)", "number", { min: "1", max: "365" })}{field("minimumMarginPercent", "Margem mínima (%)", "number", { min: "0", max: "99.99", step: "0.01" })}{field("attendantMaxDiscountPercent", "Desconto máximo do atendente (%)", "number", { min: "0", max: "100", step: "0.01" })}</div></SettingsSection><SettingsSection id="horario" title="Horário de funcionamento" description="Usado pela agenda para calcular quais horários estão disponíveis para novos agendamentos."><BusinessHoursSection tenantId={tenant.id} /></SettingsSection><SettingsSection id="baias" title="Baias e capacidade" description="Cada baia é uma vaga de atendimento simultâneo. A agenda só libera um horário se sobrar baia livre nele."><BaysSection tenantId={tenant.id} /></SettingsSection><SettingsSection id="mensagem" title="Mensagem preparada para orçamento" description="O sistema apenas prepara o texto para revisão e cópia manual. Variáveis disponíveis: {{cliente}}, {{veiculo}}, {{total}}, {{link}} e {{oficina}}."><Textarea id="quoteMessageTemplate" className="min-h-32" value={form.quoteMessageTemplate} onChange={event => setForm(current => ({ ...current, quoteMessageTemplate: event.target.value }))} placeholder="Olá, {{cliente}}. Seu orçamento para {{veiculo}} está pronto. Total: {{total}}. Consulte: {{link}}" /></SettingsSection><SettingsSection id="publico" title="Página pública da oficina" description="Ajuste o título e as cores aplicadas somente aos links públicos desta oficina."><div className="grid gap-6 lg:grid-cols-[1fr_280px]"><div className="grid gap-4">{field("publicTitle", "Título público", "text", { placeholder: tenant.name })}<div className="grid gap-3 sm:grid-cols-3">{(["primaryColor", "secondaryColor", "accentColor"] as const).map(key => <div className="grid gap-2" key={key}><Label htmlFor={`${key}-text`}>{key === "primaryColor" ? "Ação" : key === "secondaryColor" ? "Base" : "Destaque"}</Label><div className="flex gap-2"><Input aria-label={`Cor ${key}`} type="color" className="h-10 w-12 p-1" value={form[key]} onChange={event => setForm(current => ({ ...current, [key]: event.target.value }))} /><Input id={`${key}-text`} value={form[key]} onChange={event => setForm(current => ({ ...current, [key]: event.target.value }))} /></div></div>)}</div></div><div className="border border-slate-200 p-5" style={{ background: form.secondaryColor }}><p className="text-xs font-semibold uppercase tracking-[.12em]" style={{ color: form.accentColor }}>Página pública</p><p className="mt-4 text-xl font-semibold text-white">{form.publicTitle || tenant.name}</p><p className="mt-2 text-sm text-slate-300">Solicite seu orçamento online.</p><div className="mt-5 h-2 w-20" style={{ background: form.primaryColor }} /></div></div></SettingsSection><div className="flex justify-end border-t border-slate-200 pt-5"><Button onClick={save} disabled={isSaving}><Save className="mr-2 h-4 w-4" />{isSaving ? "Salvando…" : "Salvar alterações"}</Button></div></main></DashboardLayout>;
}
