import { useAuth } from "@/_core/hooks/useAuth";
import { PeriodPicker } from "@/components/PeriodPicker";
import { SafeLink as Link } from "@/components/SafeLink";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { getPeriodRange, startOfDay, type PeriodView } from "@/lib/periodRange";
import { trpc } from "@/lib/trpc";
import { ArrowUpRight, Ban, Building2, CircleDollarSign, Copy, FileSignature, Gauge, History, KeyRound, Link2, LogIn, Pencil, Plus, ShieldCheck, Trash2, UsersRound, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type PlatformSection = "overview" | "tenants" | "plans" | "contracts" | "links" | "audit";
type MemberRole = "owner" | "admin" | "attendant" | "technician";
const roleLabels: Record<MemberRole, string> = { owner: "Proprietário", admin: "Administrador", attendant: "Atendente", technician: "Técnico" };
const quoteStatusLabels: Record<string, string> = { sent: "Enviada", viewed: "Visualizada", approved: "Aprovada", rejected: "Recusada", expired: "Expirada" };
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const actionCategories = [
  { value: "", label: "Todas as ações" },
  { value: "tenant_member.", label: "Acesso de equipe" },
  { value: "tenant.", label: "Oficina" },
  { value: "quote.", label: "Orçamentos" },
  { value: "work_order.", label: "Ordens de serviço" },
];

export function getPlatformAccessState(user: { platformRole?: string | null } | null, loading: boolean) {
  if (loading) return "loading" as const;
  if (!user) return "unauthenticated" as const;
  return user.platformRole === "super_admin" ? ("granted" as const) : ("forbidden" as const);
}

export default function Platform() {
  const { user, loading } = useAuth();
  const access = getPlatformAccessState(user, loading);
  if (access === "loading") return <main className="min-h-screen bg-[#f7f8fa] p-5 sm:p-10"><div className="mx-auto max-w-7xl space-y-5"><Skeleton className="h-20 w-full" /><Skeleton className="h-72 w-full" /></div></main>;
  if (access !== "granted") return <RestrictedPage unauthenticated={access === "unauthenticated"} />;
  return <PlatformDashboard />;
}

function RestrictedPage({ unauthenticated }: { unauthenticated: boolean }) {
  return <main className="grid min-h-screen place-items-center bg-[#f7f8fa] p-5"><Card className="w-full max-w-md border-slate-200 shadow-sm"><CardHeader><div className="mb-2 grid h-10 w-10 place-items-center rounded-xl bg-slate-950 text-orange-400"><ShieldCheck className="h-5 w-5" /></div><CardTitle>Acesso restrito</CardTitle><CardDescription>{unauthenticated ? "Entre com uma identidade autorizada para acessar a administração da plataforma." : "Seu perfil não possui acesso à administração global da plataforma."}</CardDescription></CardHeader><CardContent><Link href="/"><a><Button variant="outline">Voltar à operação</Button></a></Link></CardContent></Card></main>;
}

function copyToClipboard(value: string) {
  navigator.clipboard?.writeText(value).then(() => toast.success("Link copiado.")).catch(() => toast.error("Não foi possível copiar o link."));
}

export function PlatformDashboard() {
  const [section, setSection] = useState<PlatformSection>("overview");
  const sections: { id: PlatformSection; label: string; icon: typeof Building2 }[] = [
    { id: "overview", label: "Visão geral", icon: Gauge },
    { id: "tenants", label: "Oficinas & Acessos", icon: Building2 },
    { id: "plans", label: "Planos", icon: CircleDollarSign },
    { id: "contracts", label: "Contratos", icon: FileSignature },
    { id: "links", label: "Links de aprovação", icon: Link2 },
    { id: "audit", label: "Auditoria", icon: History },
  ];

  return <main className="min-h-screen bg-[#f7f8fa] text-slate-950">
    <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col lg:flex-row">
      <aside className="border-b border-slate-200 bg-slate-950 text-slate-100 lg:sticky lg:top-0 lg:h-screen lg:w-72 lg:border-b-0 lg:border-r">
        <div className="flex h-full flex-col p-5">
          <div className="mb-7">
            <Link href="/"><a className="text-xs font-medium text-slate-400 hover:text-white">← Voltar à operação</a></Link>
            <div className="mt-5 flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-orange-400 text-slate-950"><ShieldCheck className="h-5 w-5" /></div><div><p className="text-base font-semibold">Platform</p><p className="text-xs text-slate-400">OficinaOS · Super Admin</p></div></div>
          </div>
          <nav className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible" aria-label="Navegação da plataforma">
            {sections.map(item => { const Icon = item.icon; const active = item.id === section; return <button key={item.id} type="button" aria-current={active ? "page" : undefined} onClick={() => setSection(item.id)} className={`flex min-w-max items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${active ? "bg-white text-slate-950" : "text-slate-300 hover:bg-slate-800 hover:text-white"}`}><Icon className="h-4 w-4" /><span>{item.label}</span></button>; })}
          </nav>
          <div className="mt-auto hidden rounded-xl border border-slate-700 bg-slate-900 p-4 lg:block"><p className="text-xs font-semibold uppercase tracking-[.12em] text-orange-300">Fonte única</p><p className="mt-2 text-xs leading-5 text-slate-400">Todas as oficinas, acessos e links vêm direto do banco Supabase, sem dados calculados fora daqui.</p></div>
        </div>
      </aside>
      <div className="min-w-0 flex-1 p-5 sm:p-8 lg:p-10">
        {section === "overview" ? <OverviewSection /> : section === "tenants" ? <TenantsSection /> : section === "plans" ? <PlansSection /> : section === "contracts" ? <ContractsSection /> : section === "links" ? <PublicLinksSection /> : <AuditSection />}
      </div>
    </div>
  </main>;
}

type PlatformTenant = {
  id: number; name: string; slug: string; status: string; active: boolean; isDemo: boolean; createdAt: string; publicIntakeLink: string; memberCount: number; ownerName: string | null; ownerEmail: string | null;
  planId: number | null; planName: string | null;
  contact: { whatsapp: string | null; email: string | null; phone: string | null; legalName: string | null; document: string | null };
  branding: { primaryColor: string | null; secondaryColor: string | null; accentColor: string | null; logoUrl: string | null; publicTitle: string | null };
};
type PlatformPlan = { id: number; code: string; name: string; description: string | null; maxUsers: number; maxCustomers: number | null; active: boolean; tenantCount: number };

function statusLabel(tenant: PlatformTenant) {
  if (tenant.isDemo) return "Demo";
  if (!tenant.active) return "inativa";
  if (tenant.status === "suspended") return "Suspensa";
  return tenant.status;
}

function OverviewSection() {
  const [view, setView] = useState<PeriodView>("month");
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const range = getPeriodRange(view, anchor);
  const stats = trpc.platform.dashboard.stats.useQuery({ rangeStart: range.start.toISOString(), rangeEnd: range.end.toISOString() });

  const cards = [
    { label: "Oficinas ativas", value: stats.data ? String(stats.data.activeTenants) : "—", hint: "Todas as oficinas em operação, incluindo a demo" },
    { label: "Usuários da plataforma", value: stats.data ? String(stats.data.platformUsers) : "—", hint: "Donos e equipe de todas as oficinas, exclui a demo" },
    { label: "Faturamento do período", value: stats.data ? money.format(Number(stats.data.periodRevenue)) : "—", hint: "Contratos ativos no período + receitas lançadas" },
    { label: "Contratos em negociação", value: stats.data ? String(stats.data.negotiatingContracts) : "—", hint: "Pipeline comercial aberto" },
  ];

  return <div className="space-y-6">
    <header className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end">
      <div><p className="text-xs font-semibold uppercase tracking-[.13em] text-orange-700">Plataforma global</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Visão geral</h1><p className="mt-2 text-sm text-slate-500">Métricas consolidadas do negócio, direto do banco.</p></div>
      <PeriodPicker view={view} onViewChange={setView} anchor={anchor} onAnchorChange={setAnchor} />
    </header>

    {stats.isError ? <QueryError title="Métricas indisponíveis" description="Não foi possível calcular as métricas agora." /> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map(card => <Card key={card.label} className="border-slate-200 shadow-none">
        <CardHeader className="pb-2"><CardDescription>{card.label}</CardDescription></CardHeader>
        <CardContent>{stats.isLoading ? <Skeleton className="h-8 w-24" /> : <p className="text-3xl font-semibold tracking-tight text-slate-950">{card.value}</p>}<p className="mt-2 text-xs text-slate-500">{card.hint}</p></CardContent>
      </Card>)}
    </div>}
  </div>;
}

function TenantsSection() {
  const utils = trpc.useUtils();
  const tenants = trpc.platform.tenants.list.useQuery();
  const [selectedTenantId, setSelectedTenantId] = useState<number | null>(null);
  const [editingTenantId, setEditingTenantId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", slug: "", whatsapp: "" });

  const createTenant = trpc.workspace.createTenant.useMutation({
    onSuccess: () => { toast.success("Oficina criada."); setCreateForm({ name: "", slug: "", whatsapp: "" }); setShowCreate(false); utils.platform.tenants.list.invalidate(); },
    onError: error => toast.error(error.message),
  });
  const setStatus = trpc.platform.tenants.setStatus.useMutation({
    onSuccess: result => { toast.success(result.status === "suspended" ? "Oficina suspensa." : "Oficina reativada."); utils.platform.tenants.list.invalidate(); },
    onError: error => toast.error(error.message),
  });

  const selectedTenant = tenants.data?.find(t => t.id === selectedTenantId) ?? null;
  const editingTenant = tenants.data?.find(t => t.id === editingTenantId) ?? null;

  return <div className="space-y-6">
    <header className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end">
      <div><p className="text-xs font-semibold uppercase tracking-[.13em] text-orange-700">Plataforma global</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Oficinas & Acessos</h1><p className="mt-2 text-sm text-slate-500">Diretório completo das oficinas, links públicos de solicitação e concessão de acesso à equipe.</p></div>
      <Button onClick={() => setShowCreate(current => !current)}><Plus className="mr-2 h-4 w-4" />Nova oficina</Button>
    </header>

    {showCreate ? <Card className="border-slate-200 shadow-sm">
      <CardHeader><CardTitle className="text-lg">Nova oficina</CardTitle></CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-2"><Label htmlFor="tenant-name">Nome comercial</Label><Input id="tenant-name" value={createForm.name} onChange={event => setCreateForm({ ...createForm, name: event.target.value })} placeholder="Auto Prime Centro Automotivo" /></div>
        <div className="grid gap-2"><Label htmlFor="tenant-slug">Identificador público (slug)</Label><Input id="tenant-slug" value={createForm.slug} onChange={event => setCreateForm({ ...createForm, slug: event.target.value.toLowerCase() })} placeholder="auto-prime" /></div>
        <div className="grid gap-2"><Label htmlFor="tenant-whatsapp">WhatsApp (opcional)</Label><Input id="tenant-whatsapp" value={createForm.whatsapp} onChange={event => setCreateForm({ ...createForm, whatsapp: event.target.value })} placeholder="+55 11 90000-0000" /></div>
        <div className="sm:col-span-3"><Button disabled={createTenant.isPending || createForm.name.trim().length < 3 || !createForm.slug.trim()} onClick={() => createTenant.mutate({ name: createForm.name, slug: createForm.slug, whatsapp: createForm.whatsapp || undefined })}>{createTenant.isPending ? "Criando…" : "Criar oficina"}</Button></div>
      </CardContent>
    </Card> : null}

    <Card className="border-slate-200 shadow-none">
      <CardHeader><CardTitle>Oficinas cadastradas</CardTitle><CardDescription>Clique em uma oficina para gerenciar a equipe e conceder acesso.</CardDescription></CardHeader>
      <CardContent>
        {tenants.isLoading ? <Skeleton className="h-36" /> : tenants.isError ? <QueryError title="Diretório indisponível" description="Não foi possível consultar as oficinas agora." /> : tenants.data?.length ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {tenants.data.map(tenant => <div key={tenant.id} className={`rounded-xl border p-4 text-left transition-colors ${selectedTenantId === tenant.id ? "border-orange-400 bg-orange-50/60" : "border-slate-200 hover:border-slate-300"}`}>
            <button type="button" className="w-full text-left" onClick={() => setSelectedTenantId(tenant.id)}>
              <div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{tenant.name}</p><p className="mt-1 text-xs text-slate-500">{tenant.slug}</p></div><Badge variant="outline" className={tenant.status === "suspended" ? "border-red-200 bg-red-50 text-red-800" : undefined}>{statusLabel(tenant)}</Badge></div>
              <p className="mt-4 flex items-center gap-1.5 text-xs text-slate-500"><UsersRound className="h-3.5 w-3.5" />{tenant.memberCount} integrante(s){tenant.ownerName ? ` · dono: ${tenant.ownerName}` : ""}</p>
              <p className="mt-1 text-xs text-slate-500">Plano: {tenant.planName ?? "sem plano"}</p>
            </button>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <a className="inline-flex items-center gap-1 text-xs font-medium text-orange-700 hover:text-orange-900 hover:underline" href={tenant.publicIntakeLink} target="_blank" rel="noreferrer">Link de solicitação <ArrowUpRight className="h-3.5 w-3.5" /></a>
              <button type="button" className="text-slate-400 hover:text-slate-700" onClick={() => copyToClipboard(`${window.location.origin}${tenant.publicIntakeLink}`)} aria-label="Copiar link de solicitação"><Copy className="h-3.5 w-3.5" /></button>
              <Button size="sm" variant="outline" onClick={() => setEditingTenantId(tenant.id)}><Pencil className="mr-1.5 h-3.5 w-3.5" />Editar</Button>
              {!tenant.isDemo ? <Button size="sm" variant="outline" onClick={() => window.open(`/?asTenant=${tenant.id}`, "_blank", "noopener,noreferrer")}><LogIn className="mr-1.5 h-3.5 w-3.5" />Entrar como</Button> : null}
              {!tenant.isDemo ? <Button size="sm" variant="outline" className={tenant.status === "suspended" ? "ml-auto" : "ml-auto text-red-700 hover:bg-red-50 hover:text-red-800"} disabled={setStatus.isPending} onClick={() => setStatus.mutate({ tenantId: tenant.id, status: tenant.status === "suspended" ? "active" : "suspended" })}>{tenant.status === "suspended" ? "Reativar" : <><Ban className="mr-1.5 h-3.5 w-3.5" />Suspender</>}</Button> : null}
            </div>
          </div>)}
        </div> : <EmptyState title="Nenhuma oficina cadastrada" description="Crie a primeira oficina para liberar o acesso e o link público de solicitação." />}
      </CardContent>
    </Card>

    {editingTenant ? <TenantEditPanel tenant={editingTenant} onClose={() => setEditingTenantId(null)} /> : null}
    {selectedTenant ? <TenantAccessCard tenant={selectedTenant} onClose={() => setSelectedTenantId(null)} /> : null}
  </div>;
}

function TenantAccessCard({ tenant, onClose }: { tenant: PlatformTenant; onClose: () => void }) {
  const utils = trpc.useUtils();
  const members = trpc.platform.tenants.members.useQuery({ tenantId: tenant.id });
  const [grantForm, setGrantForm] = useState({ email: "", name: "", role: "attendant" as MemberRole });

  const invalidate = () => { utils.platform.tenants.members.invalidate({ tenantId: tenant.id }); utils.platform.tenants.list.invalidate(); };
  const grantAccess = trpc.platform.access.grant.useMutation({
    onSuccess: result => { toast.success(result.invited ? "Convite enviado por e-mail para definir a senha." : "Acesso concedido."); setGrantForm({ email: "", name: "", role: "attendant" }); invalidate(); },
    onError: error => toast.error(error.message),
  });
  const revokeAccess = trpc.platform.access.revoke.useMutation({
    onSuccess: () => { toast.success("Acesso revogado."); invalidate(); },
    onError: error => toast.error(error.message),
  });

  return <Card className="border-orange-200 shadow-sm">
    <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
      <div><CardTitle className="text-lg">Acessos · {tenant.name}</CardTitle><CardDescription>Conceda acesso por e-mail. Quem ainda não tem conta recebe um e-mail automático para definir a senha.</CardDescription></div>
      <Button size="sm" variant="ghost" onClick={onClose}>Fechar</Button>
    </CardHeader>
    <CardContent className="space-y-5">
      <div className="grid gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4 sm:grid-cols-[1.2fr_1fr_.8fr_auto] sm:items-end">
        <div className="grid gap-1.5"><Label htmlFor="grant-email">E-mail</Label><Input id="grant-email" type="email" value={grantForm.email} onChange={event => setGrantForm({ ...grantForm, email: event.target.value })} placeholder="pessoa@oficina.com" /></div>
        <div className="grid gap-1.5"><Label htmlFor="grant-name">Nome (opcional)</Label><Input id="grant-name" value={grantForm.name} onChange={event => setGrantForm({ ...grantForm, name: event.target.value })} placeholder="Nome completo" /></div>
        <div className="grid gap-1.5"><Label htmlFor="grant-role">Papel</Label><select id="grant-role" className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm" value={grantForm.role} onChange={event => setGrantForm({ ...grantForm, role: event.target.value as MemberRole })}>{Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
        <Button disabled={grantAccess.isPending || !grantForm.email.trim()} onClick={() => grantAccess.mutate({ tenantId: tenant.id, email: grantForm.email, role: grantForm.role, name: grantForm.name || undefined })}><KeyRound className="mr-2 h-4 w-4" />{grantAccess.isPending ? "Concedendo…" : "Conceder acesso"}</Button>
        {grantForm.role === "owner" ? <p className="sm:col-span-4 text-xs text-amber-700">Um Proprietário concede controle total; a oficina pode ter mais de um Proprietário ao mesmo tempo.</p> : null}
      </div>

      {members.isLoading ? <Skeleton className="h-24" /> : members.isError ? <QueryError title="Integrantes indisponíveis" description="Não foi possível listar os integrantes desta oficina." /> : members.data?.length ? <div className="space-y-2">
        {members.data.map(member => <div key={member.id} className="flex flex-col gap-2 rounded-xl border border-slate-100 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="font-medium text-slate-900">{member.name ?? "Sem nome"}</p><p className="text-xs text-slate-500">{member.email ?? "sem e-mail"}</p></div>
          <div className="flex items-center gap-2"><Badge variant="outline">{roleLabels[member.role]}</Badge><Badge className={member.active ? "bg-emerald-50 text-emerald-800 hover:bg-emerald-50" : "bg-slate-100 text-slate-600 hover:bg-slate-100"}>{member.active ? "Ativo" : "Revogado"}</Badge>{member.active ? <Button size="sm" variant="outline" className="text-red-700 hover:bg-red-50 hover:text-red-800" disabled={revokeAccess.isPending} onClick={() => revokeAccess.mutate({ tenantId: tenant.id, userId: member.userId })}><Trash2 className="mr-1.5 h-3.5 w-3.5" />Revogar</Button> : null}</div>
        </div>)}
      </div> : <EmptyState title="Nenhum integrante ainda" description="Conceda o primeiro acesso pelo formulário acima." />}
    </CardContent>
  </Card>;
}

function TenantEditPanel({ tenant, onClose }: { tenant: PlatformTenant; onClose: () => void }) {
  const utils = trpc.useUtils();
  const plans = trpc.platform.plans.list.useQuery();
  const setPlan = trpc.platform.tenants.setPlan.useMutation({
    onSuccess: () => { toast.success("Plano atualizado."); utils.platform.tenants.list.invalidate(); },
    onError: error => toast.error(error.message),
  });
  const [form, setForm] = useState({
    name: tenant.name,
    slug: tenant.slug,
    whatsapp: tenant.contact.whatsapp ?? "",
    email: tenant.contact.email ?? "",
    phone: tenant.contact.phone ?? "",
    legalName: tenant.contact.legalName ?? "",
    document: tenant.contact.document ?? "",
    primaryColor: tenant.branding.primaryColor ?? "#E84D1C",
    secondaryColor: tenant.branding.secondaryColor ?? "#171717",
    accentColor: tenant.branding.accentColor ?? "#F5B33A",
    logoUrl: tenant.branding.logoUrl ?? "",
    publicTitle: tenant.branding.publicTitle ?? "",
  });
  const [confirmSlugChange, setConfirmSlugChange] = useState(false);
  const slugChanged = form.slug.trim().toLowerCase() !== tenant.slug;

  const update = trpc.platform.tenants.update.useMutation({
    onSuccess: () => { toast.success("Oficina atualizada."); setConfirmSlugChange(false); utils.platform.tenants.list.invalidate(); onClose(); },
    onError: error => toast.error(error.message),
  });

  const submit = () => {
    if (slugChanged && !confirmSlugChange) return;
    update.mutate({
      tenantId: tenant.id,
      name: form.name,
      slug: slugChanged ? form.slug.trim().toLowerCase() : undefined,
      whatsapp: form.whatsapp || undefined,
      email: form.email || undefined,
      phone: form.phone || undefined,
      legalName: form.legalName || undefined,
      document: form.document || undefined,
      primaryColor: form.primaryColor || undefined,
      secondaryColor: form.secondaryColor || undefined,
      accentColor: form.accentColor || undefined,
      logoUrl: form.logoUrl || undefined,
      publicTitle: form.publicTitle || undefined,
    });
  };

  return <Card className="border-orange-200 shadow-sm">
    <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
      <div><CardTitle className="text-lg">Editar · {tenant.name}</CardTitle><CardDescription>Dados gerais, contato e marca da oficina.</CardDescription></div>
      <Button size="sm" variant="ghost" onClick={onClose}>Fechar</Button>
    </CardHeader>
    <CardContent className="space-y-6">
      <section className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Dados gerais</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5"><Label htmlFor="edit-name">Nome comercial</Label><Input id="edit-name" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></div>
          <div className="grid gap-1.5"><Label htmlFor="edit-slug">Identificador público (slug)</Label><Input id="edit-slug" value={form.slug} onChange={event => { setForm({ ...form, slug: event.target.value.toLowerCase() }); setConfirmSlugChange(false); }} /></div>
          <div className="grid gap-1.5"><Label htmlFor="edit-plan">Plano</Label><select id="edit-plan" className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm" value={tenant.planId ?? ""} disabled={setPlan.isPending} onChange={event => setPlan.mutate({ tenantId: tenant.id, planId: Number(event.target.value) })}>{plans.data?.map(plan => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></div>
        </div>
        {slugChanged ? <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><p>Mudar o slug muda o link público de solicitação — <code>/solicitar/{tenant.slug}</code> deixa de funcionar; o novo será <code>/solicitar/{form.slug || "..."}</code>.</p><label className="mt-2 flex items-center gap-2 font-medium"><input type="checkbox" checked={confirmSlugChange} onChange={event => setConfirmSlugChange(event.target.checked)} />Entendo e quero mudar o link público</label></div> : null}
      </section>

      <section className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Contato</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5"><Label htmlFor="edit-whatsapp">WhatsApp</Label><Input id="edit-whatsapp" value={form.whatsapp} onChange={event => setForm({ ...form, whatsapp: event.target.value })} /></div>
          <div className="grid gap-1.5"><Label htmlFor="edit-email">E-mail</Label><Input id="edit-email" type="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} /></div>
          <div className="grid gap-1.5"><Label htmlFor="edit-phone">Telefone</Label><Input id="edit-phone" value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} /></div>
          <div className="grid gap-1.5"><Label htmlFor="edit-document">CNPJ/CPF</Label><Input id="edit-document" value={form.document} onChange={event => setForm({ ...form, document: event.target.value })} /></div>
          <div className="grid gap-1.5 sm:col-span-2"><Label htmlFor="edit-legal-name">Razão social</Label><Input id="edit-legal-name" value={form.legalName} onChange={event => setForm({ ...form, legalName: event.target.value })} /></div>
        </div>
      </section>

      <section className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Marca</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="grid gap-1.5"><Label htmlFor="edit-primary-color">Cor primária</Label><Input id="edit-primary-color" type="color" className="h-9 p-1" value={form.primaryColor} onChange={event => setForm({ ...form, primaryColor: event.target.value })} /></div>
          <div className="grid gap-1.5"><Label htmlFor="edit-secondary-color">Cor secundária</Label><Input id="edit-secondary-color" type="color" className="h-9 p-1" value={form.secondaryColor} onChange={event => setForm({ ...form, secondaryColor: event.target.value })} /></div>
          <div className="grid gap-1.5"><Label htmlFor="edit-accent-color">Cor de destaque</Label><Input id="edit-accent-color" type="color" className="h-9 p-1" value={form.accentColor} onChange={event => setForm({ ...form, accentColor: event.target.value })} /></div>
          <div className="grid gap-1.5 sm:col-span-2"><Label htmlFor="edit-logo-url">URL do logo</Label><Input id="edit-logo-url" value={form.logoUrl} onChange={event => setForm({ ...form, logoUrl: event.target.value })} placeholder="https://..." /></div>
          <div className="grid gap-1.5"><Label htmlFor="edit-public-title">Título público</Label><Input id="edit-public-title" value={form.publicTitle} onChange={event => setForm({ ...form, publicTitle: event.target.value })} /></div>
        </div>
      </section>

      <Button disabled={update.isPending || form.name.trim().length < 3 || (slugChanged && !confirmSlugChange)} onClick={submit}>{update.isPending ? "Salvando…" : "Salvar alterações"}</Button>
    </CardContent>
  </Card>;
}

function PlansSection() {
  const utils = trpc.useUtils();
  const plans = trpc.platform.plans.list.useQuery();
  const [editingPlanId, setEditingPlanId] = useState<number | null | "new">(null);
  const emptyForm = { code: "", name: "", description: "", maxUsers: "50", maxCustomers: "", active: true };
  const [form, setForm] = useState(emptyForm);

  const invalidate = () => utils.platform.plans.list.invalidate();
  const upsert = trpc.platform.plans.upsert.useMutation({
    onSuccess: () => { toast.success("Plano salvo."); setEditingPlanId(null); setForm(emptyForm); invalidate(); },
    onError: error => toast.error(error.message),
  });

  const startEdit = (plan: PlatformPlan) => {
    setEditingPlanId(plan.id);
    setForm({ code: plan.code, name: plan.name, description: plan.description ?? "", maxUsers: String(plan.maxUsers), maxCustomers: plan.maxCustomers != null ? String(plan.maxCustomers) : "", active: plan.active });
  };
  const startNew = () => { setEditingPlanId("new"); setForm(emptyForm); };

  return <div className="space-y-6">
    <header className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end">
      <div><p className="text-xs font-semibold uppercase tracking-[.13em] text-orange-700">Plataforma global</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Planos</h1><p className="mt-2 text-sm text-slate-500">Limites por oficina. Toda oficina nova entra automaticamente no plano Padrão.</p></div>
      <Button onClick={startNew}><Plus className="mr-2 h-4 w-4" />Novo plano</Button>
    </header>

    {editingPlanId !== null ? <Card className="border-orange-200 shadow-sm">
      <CardHeader><CardTitle className="text-lg">{editingPlanId === "new" ? "Novo plano" : "Editar plano"}</CardTitle></CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5"><Label htmlFor="plan-name">Nome</Label><Input id="plan-name" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="Pro" /></div>
        <div className="grid gap-1.5"><Label htmlFor="plan-code">Código</Label><Input id="plan-code" value={form.code} onChange={event => setForm({ ...form, code: event.target.value.toLowerCase() })} placeholder="pro" /></div>
        <div className="grid gap-1.5 sm:col-span-2"><Label htmlFor="plan-description">Descrição</Label><Input id="plan-description" value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} /></div>
        <div className="grid gap-1.5"><Label htmlFor="plan-max-users">Limite de usuários</Label><Input id="plan-max-users" type="number" min="1" value={form.maxUsers} onChange={event => setForm({ ...form, maxUsers: event.target.value })} /></div>
        <div className="grid gap-1.5"><Label htmlFor="plan-max-customers">Limite de clientes (vazio = sem limite)</Label><Input id="plan-max-customers" type="number" min="0" value={form.maxCustomers} onChange={event => setForm({ ...form, maxCustomers: event.target.value })} /></div>
        <div className="flex items-center gap-2 sm:col-span-2"><input id="plan-active" type="checkbox" checked={form.active} onChange={event => setForm({ ...form, active: event.target.checked })} /><Label htmlFor="plan-active">Plano ativo</Label></div>
        <div className="flex gap-2 sm:col-span-2">
          <Button disabled={upsert.isPending || !form.name.trim() || !form.code.trim()} onClick={() => upsert.mutate({ planId: editingPlanId === "new" ? undefined : editingPlanId, code: form.code, name: form.name, description: form.description || undefined, maxUsers: Number(form.maxUsers) || 1, maxCustomers: form.maxCustomers ? Number(form.maxCustomers) : undefined, active: form.active })}>{upsert.isPending ? "Salvando…" : "Salvar plano"}</Button>
          <Button variant="ghost" onClick={() => setEditingPlanId(null)}>Cancelar</Button>
        </div>
      </CardContent>
    </Card> : null}

    <Card className="border-slate-200 shadow-none">
      <CardHeader><CardTitle>Planos cadastrados</CardTitle></CardHeader>
      <CardContent>
        {plans.isLoading ? <Skeleton className="h-36" /> : plans.isError ? <QueryError title="Planos indisponíveis" description="Não foi possível consultar os planos agora." /> : plans.data?.length ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {plans.data.map(plan => <div key={plan.id} className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{plan.name}</p><p className="mt-1 text-xs text-slate-500">{plan.code}</p></div><Badge variant="outline" className={plan.active ? undefined : "border-slate-200 bg-slate-100 text-slate-500"}>{plan.active ? "Ativo" : "Inativo"}</Badge></div>
            {plan.description ? <p className="mt-2 text-xs text-slate-500">{plan.description}</p> : null}
            <p className="mt-3 text-xs text-slate-500">Até {plan.maxUsers} usuário(s) · {plan.maxCustomers == null ? "clientes ilimitados" : `até ${plan.maxCustomers} clientes`}</p>
            <p className="mt-1 text-xs text-slate-500">{plan.tenantCount} oficina(s) neste plano</p>
            <Button size="sm" variant="outline" className="mt-3" onClick={() => startEdit(plan)}><Pencil className="mr-1.5 h-3.5 w-3.5" />Editar</Button>
          </div>)}
        </div> : <EmptyState title="Nenhum plano cadastrado" description="Crie o primeiro plano pelo botão acima." />}
      </CardContent>
    </Card>
  </div>;
}

type PlatformContract = {
  id: number; prospectName: string; contactWhatsapp: string | null; contactEmail: string | null; contactPhone: string | null;
  planId: number | null; planName: string | null; monthlyValue: number | string; status: "negotiating" | "closed" | "cancelled"; notes: string | null;
  tenantId: number | null; tenantName: string | null; closedAt: string | null; cancelledAt: string | null; createdAt: string;
};
type PlatformRevenue = { id: number; contractId: number | null; contractProspectName: string | null; tenantId: number | null; tenantName: string | null; description: string; amount: number | string; receivedAt: string };
const contractStatusMeta: Record<PlatformContract["status"], { label: string; className: string }> = {
  negotiating: { label: "Em negociação", className: "border-sky-200 bg-sky-50 text-sky-800" },
  closed: { label: "Fechado", className: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  cancelled: { label: "Cancelado", className: "border-slate-200 bg-slate-100 text-slate-500" },
};

function slugify(value: string) {
  return value.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function ContractsSection() {
  const utils = trpc.useUtils();
  const contracts = trpc.platform.contracts.list.useQuery();
  const plans = trpc.platform.plans.list.useQuery();
  const revenues = trpc.platform.revenues.list.useQuery({});
  const [showCreate, setShowCreate] = useState(false);
  const emptyForm = { prospectName: "", monthlyValue: "", planId: "", contactWhatsapp: "", contactEmail: "", contactPhone: "", notes: "" };
  const [form, setForm] = useState(emptyForm);
  const [revenueForm, setRevenueForm] = useState({ description: "", amount: "", contractId: "" });
  const [generatingContractId, setGeneratingContractId] = useState<number | null>(null);
  const [generateSlug, setGenerateSlug] = useState("");

  const invalidateContracts = () => { utils.platform.contracts.list.invalidate(); utils.platform.dashboard.stats.invalidate(); };
  const invalidateRevenues = () => { utils.platform.revenues.list.invalidate(); utils.platform.dashboard.stats.invalidate(); };

  const createContract = trpc.platform.contracts.create.useMutation({
    onSuccess: () => { toast.success("Contrato registrado."); setForm(emptyForm); setShowCreate(false); invalidateContracts(); },
    onError: error => toast.error(error.message),
  });
  const closeContract = trpc.platform.contracts.close.useMutation({
    onSuccess: () => { toast.success("Contrato fechado."); invalidateContracts(); },
    onError: error => toast.error(error.message),
  });
  const setTenantStatus = trpc.platform.tenants.setStatus.useMutation({
    onSuccess: () => { toast.success("Oficina suspensa."); utils.platform.tenants.list.invalidate(); },
    onError: error => toast.error(error.message),
  });
  const cancelContract = trpc.platform.contracts.cancel.useMutation({
    onSuccess: result => {
      toast.success("Contrato cancelado.");
      invalidateContracts();
      if (result.tenantId && window.confirm("Contrato cancelado. Deseja também suspender a oficina vinculada agora?")) {
        setTenantStatus.mutate({ tenantId: result.tenantId, status: "suspended" });
      }
    },
    onError: error => toast.error(error.message),
  });
  const generateTenant = trpc.platform.contracts.generateTenant.useMutation({
    onSuccess: () => { toast.success("Oficina gerada a partir do contrato."); setGeneratingContractId(null); setGenerateSlug(""); invalidateContracts(); utils.platform.tenants.list.invalidate(); },
    onError: error => toast.error(error.message),
  });
  const createRevenue = trpc.platform.revenues.create.useMutation({
    onSuccess: () => { toast.success("Receita lançada."); setRevenueForm({ description: "", amount: "", contractId: "" }); invalidateRevenues(); },
    onError: error => toast.error(error.message),
  });

  const startGenerate = (contract: PlatformContract) => { setGeneratingContractId(contract.id); setGenerateSlug(slugify(contract.prospectName)); };

  return <div className="space-y-6">
    <header className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end">
      <div><p className="text-xs font-semibold uppercase tracking-[.13em] text-orange-700">Plataforma global</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Contratos</h1><p className="mt-2 text-sm text-slate-500">Pipeline comercial: negocie, feche o contrato e gere a oficina no SaaS. Fechado não muda mais o valor — reajuste vira um novo contrato.</p></div>
      <Button onClick={() => setShowCreate(current => !current)}><Plus className="mr-2 h-4 w-4" />Novo contrato</Button>
    </header>

    {showCreate ? <Card className="border-slate-200 shadow-sm">
      <CardHeader><CardTitle className="text-lg">Novo contrato</CardTitle><CardDescription>Prospect ainda sem oficina — ao fechar, você poderá gerar a oficina a partir daqui.</CardDescription></CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1.5"><Label htmlFor="contract-name">Nome do prospect/oficina</Label><Input id="contract-name" value={form.prospectName} onChange={event => setForm({ ...form, prospectName: event.target.value })} placeholder="Auto Prime Centro Automotivo" /></div>
        <div className="grid gap-1.5"><Label htmlFor="contract-value">Valor mensal (R$)</Label><Input id="contract-value" type="number" min="0" step="0.01" value={form.monthlyValue} onChange={event => setForm({ ...form, monthlyValue: event.target.value })} placeholder="299.00" /></div>
        <div className="grid gap-1.5"><Label htmlFor="contract-plan">Plano negociado</Label><select id="contract-plan" className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm" value={form.planId} onChange={event => setForm({ ...form, planId: event.target.value })}><option value="">Sem plano definido</option>{plans.data?.map(plan => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></div>
        <div className="grid gap-1.5"><Label htmlFor="contract-whatsapp">WhatsApp</Label><Input id="contract-whatsapp" value={form.contactWhatsapp} onChange={event => setForm({ ...form, contactWhatsapp: event.target.value })} /></div>
        <div className="grid gap-1.5"><Label htmlFor="contract-email">E-mail</Label><Input id="contract-email" type="email" value={form.contactEmail} onChange={event => setForm({ ...form, contactEmail: event.target.value })} /></div>
        <div className="grid gap-1.5"><Label htmlFor="contract-phone">Telefone</Label><Input id="contract-phone" value={form.contactPhone} onChange={event => setForm({ ...form, contactPhone: event.target.value })} /></div>
        <div className="grid gap-1.5 sm:col-span-3"><Label htmlFor="contract-notes">Observações</Label><Input id="contract-notes" value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} placeholder="Condições combinadas, prazo, etc." /></div>
        <div className="sm:col-span-3"><Button disabled={createContract.isPending || form.prospectName.trim().length < 2 || !form.monthlyValue} onClick={() => createContract.mutate({ prospectName: form.prospectName, monthlyValue: Number(form.monthlyValue), planId: form.planId ? Number(form.planId) : undefined, contactWhatsapp: form.contactWhatsapp || undefined, contactEmail: form.contactEmail || undefined, contactPhone: form.contactPhone || undefined, notes: form.notes || undefined })}>{createContract.isPending ? "Registrando…" : "Registrar contrato"}</Button></div>
      </CardContent>
    </Card> : null}

    <Card className="border-slate-200 shadow-none">
      <CardHeader><CardTitle>Contratos</CardTitle></CardHeader>
      <CardContent>
        {contracts.isLoading ? <Skeleton className="h-36" /> : contracts.isError ? <QueryError title="Contratos indisponíveis" description="Não foi possível consultar os contratos agora." /> : contracts.data?.length ? <div className="space-y-3">
          {contracts.data.map(contract => <div key={contract.id} className="rounded-xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><p className="font-semibold">{contract.prospectName}</p><p className="mt-1 text-xs text-slate-500">{money.format(Number(contract.monthlyValue))}/mês · {contract.planName ?? "sem plano"}{contract.tenantName ? ` · oficina: ${contract.tenantName}` : ""}</p></div>
              <Badge variant="outline" className={contractStatusMeta[contract.status].className}>{contractStatusMeta[contract.status].label}</Badge>
            </div>
            {contract.notes ? <p className="mt-2 text-xs text-slate-500">{contract.notes}</p> : null}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {contract.status === "negotiating" ? <Button size="sm" disabled={closeContract.isPending} onClick={() => closeContract.mutate({ contractId: contract.id })}>Fechar contrato</Button> : null}
              {contract.status === "closed" && !contract.tenantId ? <Button size="sm" variant="outline" onClick={() => startGenerate(contract)}><Building2 className="mr-1.5 h-3.5 w-3.5" />Gerar oficina</Button> : null}
              {contract.status !== "cancelled" ? <Button size="sm" variant="outline" className="ml-auto text-red-700 hover:bg-red-50 hover:text-red-800" disabled={cancelContract.isPending} onClick={() => cancelContract.mutate({ contractId: contract.id })}><XCircle className="mr-1.5 h-3.5 w-3.5" />Cancelar</Button> : null}
            </div>
            {generatingContractId === contract.id ? <div className="mt-3 grid gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 sm:grid-cols-[1fr_auto]">
              <div className="grid gap-1.5"><Label htmlFor={`generate-slug-${contract.id}`} className="text-xs">Identificador público (slug) da nova oficina</Label><Input id={`generate-slug-${contract.id}`} value={generateSlug} onChange={event => setGenerateSlug(event.target.value.toLowerCase())} /></div>
              <div className="flex items-end gap-2"><Button size="sm" disabled={generateTenant.isPending || !generateSlug.trim()} onClick={() => generateTenant.mutate({ contractId: contract.id, tenantSlug: generateSlug.trim() })}>{generateTenant.isPending ? "Gerando…" : "Confirmar"}</Button><Button size="sm" variant="ghost" onClick={() => setGeneratingContractId(null)}>Cancelar</Button></div>
            </div> : null}
          </div>)}
        </div> : <EmptyState title="Nenhum contrato registrado" description="Registre o primeiro contrato pelo botão acima." />}
      </CardContent>
    </Card>

    <Card className="border-slate-200 shadow-none">
      <CardHeader><CardTitle>Lançar receita</CardTitle><CardDescription>Registro manual de valores recebidos — soma no faturamento do período, vinculado a um contrato ou avulso.</CardDescription></CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-[1.4fr_.8fr_1fr_auto] sm:items-end">
        <div className="grid gap-1.5"><Label htmlFor="revenue-description">Descrição</Label><Input id="revenue-description" value={revenueForm.description} onChange={event => setRevenueForm({ ...revenueForm, description: event.target.value })} placeholder="Mensalidade recebida, setup, etc." /></div>
        <div className="grid gap-1.5"><Label htmlFor="revenue-amount">Valor (R$)</Label><Input id="revenue-amount" type="number" min="0.01" step="0.01" value={revenueForm.amount} onChange={event => setRevenueForm({ ...revenueForm, amount: event.target.value })} /></div>
        <div className="grid gap-1.5"><Label htmlFor="revenue-contract">Contrato (opcional)</Label><select id="revenue-contract" className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm" value={revenueForm.contractId} onChange={event => setRevenueForm({ ...revenueForm, contractId: event.target.value })}><option value="">Avulso</option>{contracts.data?.map(contract => <option key={contract.id} value={contract.id}>{contract.prospectName}</option>)}</select></div>
        <Button disabled={createRevenue.isPending || revenueForm.description.trim().length < 2 || !revenueForm.amount} onClick={() => createRevenue.mutate({ description: revenueForm.description, amount: Number(revenueForm.amount), contractId: revenueForm.contractId ? Number(revenueForm.contractId) : undefined })}>{createRevenue.isPending ? "Lançando…" : "Lançar"}</Button>
      </CardContent>
      <CardContent className="pt-0">
        {revenues.isLoading ? <Skeleton className="h-24" /> : revenues.data?.length ? <div className="space-y-2">
          {revenues.data.slice(0, 20).map(revenue => <div key={revenue.id} className="flex flex-col gap-1 rounded-xl border border-slate-100 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="font-medium text-slate-900">{revenue.description}</p><p className="text-xs text-slate-500">{revenue.contractProspectName ?? revenue.tenantName ?? "Avulso"}</p></div>
            <div className="flex items-center gap-3"><p className="font-semibold text-emerald-700">{money.format(Number(revenue.amount))}</p><p className="text-xs text-slate-500">{new Date(revenue.receivedAt).toLocaleDateString("pt-BR")}</p></div>
          </div>)}
        </div> : <EmptyState title="Nenhuma receita lançada" description="Lance a primeira receita pelo formulário acima." />}
      </CardContent>
    </Card>
  </div>;
}

function PublicLinksSection() {
  const [status, setStatus] = useState<"pending" | "approved" | "all">("pending");
  const statusFilter = status === "pending" ? (["sent", "viewed"] as const) : status === "approved" ? (["approved"] as const) : undefined;
  const links = trpc.platform.links.list.useQuery({ status: statusFilter ? [...statusFilter] : undefined, page: 1, pageSize: 30 });

  return <div className="space-y-6">
    <header className="border-b border-slate-200 pb-6"><p className="text-xs font-semibold uppercase tracking-[.13em] text-orange-700">Plataforma global</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Links de aprovação</h1><p className="mt-2 text-sm text-slate-500">Propostas enviadas às clientes de todas as oficinas, com acesso direto ao link público de aprovação.</p></header>

    <div className="flex gap-2">
      {([["pending", "Aguardando"], ["approved", "Aprovadas"], ["all", "Todas"]] as const).map(([value, label]) => <Button key={value} size="sm" variant={status === value ? "default" : "outline"} onClick={() => setStatus(value)}>{label}</Button>)}
    </div>

    <Card className="border-slate-200 shadow-none">
      <CardContent className="pt-6">
        {links.isLoading ? <Skeleton className="h-48" /> : links.isError ? <QueryError title="Links indisponíveis" description="Não foi possível consultar as propostas agora." /> : links.data?.items.length ? <div className="space-y-2">
          {links.data.items.map(item => <div key={item.quoteId} className="flex flex-col gap-2 rounded-xl border border-slate-100 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="font-medium text-slate-900">#{String(item.number).padStart(6, "0")} · {item.tenantName}</p><p className="text-xs text-slate-500">{item.customerName ?? "Cliente não identificado"} · {money.format(Number(item.total))}</p></div>
            <div className="flex items-center gap-2"><Badge variant="outline">{quoteStatusLabels[item.status] ?? item.status}</Badge><Button size="sm" variant="outline" onClick={() => window.open(item.publicUrl, "_blank", "noopener,noreferrer")}>Abrir link <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" /></Button><button type="button" className="text-slate-400 hover:text-slate-700" onClick={() => copyToClipboard(`${window.location.origin}${item.publicUrl}`)} aria-label="Copiar link"><Copy className="h-3.5 w-3.5" /></button></div>
          </div>)}
        </div> : <EmptyState title="Nenhuma proposta neste filtro" description="Propostas enviadas às clientes aparecerão aqui com o link direto de aprovação." />}
      </CardContent>
    </Card>
  </div>;
}

function AuditSection() {
  const tenants = trpc.platform.tenants.list.useQuery();
  const [tenantId, setTenantId] = useState<number | "all">("all");
  const [actionPrefix, setActionPrefix] = useState("");
  const [view, setView] = useState<PeriodView>("month");
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const range = getPeriodRange(view, anchor);

  const audit = trpc.platform.audit.list.useQuery({
    tenantId: tenantId === "all" ? undefined : tenantId,
    actionPrefix: actionPrefix || undefined,
    rangeStart: range.start.toISOString(),
    rangeEnd: range.end.toISOString(),
    page: 1,
    pageSize: 50,
  });

  return <div className="space-y-6">
    <header className="border-b border-slate-200 pb-6"><p className="text-xs font-semibold uppercase tracking-[.13em] text-orange-700">Plataforma global</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Auditoria</h1><p className="mt-2 text-sm text-slate-500">Trilha de eventos críticos de todas as oficinas, filtrável por oficina, tipo de ação e período.</p></header>

    <div className="flex flex-wrap items-end gap-3">
      <div className="grid gap-1.5"><Label className="text-xs" htmlFor="audit-tenant">Oficina</Label><select id="audit-tenant" className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm" value={tenantId} onChange={event => setTenantId(event.target.value === "all" ? "all" : Number(event.target.value))}><option value="all">Todas as oficinas</option>{tenants.data?.map(tenant => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}</select></div>
      <div className="grid gap-1.5"><Label className="text-xs" htmlFor="audit-action">Tipo de ação</Label><select id="audit-action" className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm" value={actionPrefix} onChange={event => setActionPrefix(event.target.value)}>{actionCategories.map(category => <option key={category.value} value={category.value}>{category.label}</option>)}</select></div>
      <PeriodPicker view={view} onViewChange={setView} anchor={anchor} onAnchorChange={setAnchor} />
    </div>

    <Card className="border-slate-200 shadow-none">
      <CardContent className="pt-6">
        {audit.isLoading ? <Skeleton className="h-48" /> : audit.isError ? <QueryError title="Auditoria indisponível" description="Não foi possível consultar os eventos agora." /> : audit.data?.items.length ? <div className="space-y-2">
          {audit.data.items.map(entry => <div key={entry.id} className="flex flex-col gap-1 rounded-xl border border-slate-100 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="font-medium text-slate-900">{entry.action}</p><p className="text-xs text-slate-500">{entry.tenantName} · {entry.entityType}{entry.entityId ? ` #${entry.entityId}` : ""}{entry.actorName ? ` · por ${entry.actorName}` : ""}</p></div>
            <p className="text-xs text-slate-500">{new Date(entry.createdAt).toLocaleString("pt-BR")}</p>
          </div>)}
        </div> : <EmptyState title="Nenhum evento neste filtro" description="Ajuste a oficina, o tipo de ação ou o período para encontrar o que procura." />}
      </CardContent>
    </Card>
  </div>;
}

function QueryError({ title, description }: { title: string; description: string }) { return <div className="rounded-xl border border-red-200 bg-red-50 p-5"><p className="font-medium text-red-950">{title}</p><p className="mt-1 text-sm text-red-900">{description}</p></div>; }
function EmptyState({ title, description }: { title: string; description: string }) { return <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center"><p className="font-medium text-slate-800">{title}</p><p className="mx-auto mt-2 max-w-md text-sm text-slate-500">{description}</p></div>; }
