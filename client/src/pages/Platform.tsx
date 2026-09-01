import { useAuth } from "@/_core/hooks/useAuth";
import { SafeLink as Link } from "@/components/SafeLink";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { ArrowUpRight, Building2, Copy, KeyRound, Link2, Plus, ShieldCheck, Trash2, UsersRound } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type PlatformSection = "tenants" | "links";
type MemberRole = "owner" | "admin" | "attendant" | "technician";
const roleLabels: Record<MemberRole, string> = { owner: "Proprietário", admin: "Administrador", attendant: "Atendente", technician: "Técnico" };
const quoteStatusLabels: Record<string, string> = { sent: "Enviada", viewed: "Visualizada", approved: "Aprovada", rejected: "Recusada", expired: "Expirada" };
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

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
  const [section, setSection] = useState<PlatformSection>("tenants");
  const sections: { id: PlatformSection; label: string; icon: typeof Building2 }[] = [
    { id: "tenants", label: "Oficinas & Acessos", icon: Building2 },
    { id: "links", label: "Links de aprovação", icon: Link2 },
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
        {section === "tenants" ? <TenantsSection /> : <PublicLinksSection />}
      </div>
    </div>
  </main>;
}

type PlatformTenant = { id: number; name: string; slug: string; status: string; active: boolean; isDemo: boolean; createdAt: string; publicIntakeLink: string; memberCount: number; ownerName: string | null; ownerEmail: string | null };

function TenantsSection() {
  const utils = trpc.useUtils();
  const tenants = trpc.platform.tenants.list.useQuery();
  const [selectedTenantId, setSelectedTenantId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", slug: "", whatsapp: "" });

  const createTenant = trpc.workspace.createTenant.useMutation({
    onSuccess: () => { toast.success("Oficina criada."); setCreateForm({ name: "", slug: "", whatsapp: "" }); setShowCreate(false); utils.platform.tenants.list.invalidate(); },
    onError: error => toast.error(error.message),
  });

  const selectedTenant = tenants.data?.find(t => t.id === selectedTenantId) ?? null;

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
          {tenants.data.map(tenant => <button key={tenant.id} type="button" onClick={() => setSelectedTenantId(tenant.id)} className={`rounded-xl border p-4 text-left transition-colors ${selectedTenantId === tenant.id ? "border-orange-400 bg-orange-50/60" : "border-slate-200 hover:border-slate-300"}`}>
            <div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{tenant.name}</p><p className="mt-1 text-xs text-slate-500">{tenant.slug}</p></div><Badge variant="outline">{tenant.isDemo ? "Demo" : tenant.active ? tenant.status : "inativa"}</Badge></div>
            <p className="mt-4 flex items-center gap-1.5 text-xs text-slate-500"><UsersRound className="h-3.5 w-3.5" />{tenant.memberCount} integrante(s){tenant.ownerName ? ` · dono: ${tenant.ownerName}` : ""}</p>
            <div className="mt-3 flex items-center gap-2">
              <a className="inline-flex items-center gap-1 text-xs font-medium text-orange-700 hover:text-orange-900 hover:underline" href={tenant.publicIntakeLink} target="_blank" rel="noreferrer" onClick={event => event.stopPropagation()}>Link de solicitação <ArrowUpRight className="h-3.5 w-3.5" /></a>
              <button type="button" className="text-slate-400 hover:text-slate-700" onClick={event => { event.stopPropagation(); copyToClipboard(`${window.location.origin}${tenant.publicIntakeLink}`); }} aria-label="Copiar link de solicitação"><Copy className="h-3.5 w-3.5" /></button>
            </div>
          </button>)}
        </div> : <EmptyState title="Nenhuma oficina cadastrada" description="Crie a primeira oficina para liberar o acesso e o link público de solicitação." />}
      </CardContent>
    </Card>

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

function QueryError({ title, description }: { title: string; description: string }) { return <div className="rounded-xl border border-red-200 bg-red-50 p-5"><p className="font-medium text-red-950">{title}</p><p className="mt-1 text-sm text-red-900">{description}</p></div>; }
function EmptyState({ title, description }: { title: string; description: string }) { return <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center"><p className="font-medium text-slate-800">{title}</p><p className="mx-auto mt-2 max-w-md text-sm text-slate-500">{description}</p></div>; }
