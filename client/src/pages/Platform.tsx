import { SafeLink as Link } from "@/components/SafeLink";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { PlatformTenantAuditCard } from "@/components/PlatformTenantAuditCard";
import { PlatformUserManagementCard } from "@/components/PlatformUserManagementCard";
import { PlatformReportCard } from "@/components/PlatformReportCard";
import { useAuth } from "@/_core/hooks/useAuth";
import { CheckCircle2, Pencil, Plus, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type PlanForm = { code: string; name: string; description: string; maxUsers: string; maxCustomers: string; active: boolean };
const emptyPlanForm: PlanForm = { code: "", name: "", description: "", maxUsers: "3", maxCustomers: "", active: true };

function normalizeSlug(value: string) { return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""); }
function toPlanForm(plan: { code: string; name: string; description: string | null; maxUsers: number; maxCustomers: number | null; active: boolean }): PlanForm { return { code: plan.code, name: plan.name, description: plan.description ?? "", maxUsers: String(plan.maxUsers), maxCustomers: plan.maxCustomers === null ? "" : String(plan.maxCustomers), active: plan.active }; }

export function getPlatformAccessState(user: { platformRole?: string | null } | null, loading: boolean) {
  if (loading) return "loading" as const;
  if (!user) return "unauthenticated" as const;
  return user.platformRole === "super_admin" ? "granted" as const : "forbidden" as const;
}

export default function Platform() {
  const { user, loading } = useAuth();
  const accessState = getPlatformAccessState(user, loading);

  if (accessState === "loading") {
    return <main className="min-h-screen bg-[#fafaf9] p-5 sm:p-10"><div className="mx-auto max-w-7xl space-y-5"><Skeleton className="h-20 w-full" /><Skeleton className="h-28 w-full" /><Skeleton className="h-72 w-full" /></div></main>;
  }

  if (accessState !== "granted") {
    const message = accessState === "unauthenticated"
      ? "Entre com uma identidade autorizada para acessar a administração da plataforma."
      : "Seu perfil não possui acesso à administração global da plataforma.";
    return <main className="grid min-h-screen place-items-center bg-[#fafaf9] p-5"><Card className="w-full max-w-md border-slate-200 shadow-sm"><CardHeader><div className="mb-2 grid h-10 w-10 place-items-center rounded-xl bg-slate-950 text-orange-400"><ShieldCheck className="h-5 w-5" /></div><CardTitle>Acesso restrito</CardTitle><CardDescription>{message}</CardDescription></CardHeader><CardContent><Link href="/"><a><Button variant="outline">Voltar à operação</Button></a></Link></CardContent></Card></main>;
  }

  return <PlatformDashboard />;
}

function PlatformDashboard() {
  const metrics = trpc.platform.metrics.useQuery();
  const tenants = trpc.platform.overview.useQuery();
  const usage = trpc.platform.usage.useQuery();
  const plans = trpc.platform.plans.list.useQuery();
  const utils = trpc.useUtils();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [planForm, setPlanForm] = useState<PlanForm>(emptyPlanForm);
  const [editingPlanId, setEditingPlanId] = useState<number | null>(null);
  const refresh = () => { utils.platform.overview.invalidate(); utils.platform.metrics.invalidate(); utils.platform.usage.invalidate(); utils.platform.plans.list.invalidate(); };
  const create = trpc.platform.createTenant.useMutation({ onSuccess: () => { toast.success("Oficina criada e vinculada ao proprietário da plataforma."); setName(""); setSlug(""); refresh(); }, onError: error => toast.error(error.message) });
  const updateTenant = trpc.platform.updateTenant.useMutation({ onSuccess: () => { toast.success("Oficina atualizada."); refresh(); }, onError: error => toast.error(error.message) });
  const createPlan = trpc.platform.plans.create.useMutation({ onSuccess: () => { toast.success("Plano criado e registrado na trilha de auditoria."); setPlanForm(emptyPlanForm); refresh(); }, onError: error => toast.error(error.message) });
  const updatePlan = trpc.platform.plans.update.useMutation({ onSuccess: () => { toast.success("Plano atualizado e auditado."); setPlanForm(emptyPlanForm); setEditingPlanId(null); refresh(); }, onError: error => toast.error(error.message) });
  const values = metrics.data ? [{ label: "Oficinas", value: metrics.data.tenants }, { label: "Oficinas ativas", value: metrics.data.activeTenants }, { label: "Usuários", value: metrics.data.users }, { label: "Vínculos ativos", value: metrics.data.activeMemberships }] : [];
  const savePlan = () => {
    const maxUsers = Number(planForm.maxUsers);
    const maxCustomers = planForm.maxCustomers.trim() ? Number(planForm.maxCustomers) : null;
    if (!planForm.name.trim() || !Number.isInteger(maxUsers) || maxUsers < 1 || (maxCustomers !== null && (!Number.isInteger(maxCustomers) || maxCustomers < 1))) { toast.error("Informe nome e limites válidos para o plano."); return; }
    if (editingPlanId) updatePlan.mutate({ planId: editingPlanId, name: planForm.name.trim(), description: planForm.description.trim() || null, maxUsers, maxCustomers, active: planForm.active });
    else {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(planForm.code)) { toast.error("Informe um código de plano válido."); return; }
      createPlan.mutate({ code: planForm.code, name: planForm.name.trim(), description: planForm.description.trim() || null, maxUsers, maxCustomers, active: planForm.active });
    }
  };

  return <main className="min-h-screen bg-[#fafaf9] p-5 sm:p-10"><div className="mx-auto max-w-7xl space-y-7">
    <header className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end"><div><Link href="/"><a className="text-xs font-medium text-slate-500 hover:text-slate-900">← Voltar à operação</a></Link><div className="mt-3 flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-slate-950 text-orange-400"><ShieldCheck className="h-5 w-5" /></div><div><h1 className="text-3xl font-semibold tracking-tight text-slate-950">Plataforma OficinaOS</h1><p className="text-sm text-slate-500">Administração global, separada da operação de cada oficina.</p></div></div></div><Badge className="w-fit bg-slate-950 text-white hover:bg-slate-950">Super Admin</Badge></header>

    <section className="grid gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 sm:grid-cols-2 lg:grid-cols-4">{metrics.isLoading ? Array.from({ length: 4 }).map((_, index) => <Skeleton className="h-28" key={index} />) : values.map(item => <div key={item.label} className="bg-white p-5"><p className="text-xs font-semibold uppercase tracking-[.1em] text-slate-500">{item.label}</p><p className="mt-3 text-3xl font-semibold text-slate-950">{item.value}</p></div>)}</section>

    <Card className="border-orange-100 bg-orange-50/40"><CardHeader><CardTitle className="text-lg">Criar nova oficina</CardTitle><CardDescription>Criação controlada. A nova oficina nasce em tenant isolado, com o criador como proprietário inicial.</CardDescription></CardHeader><CardContent className="grid gap-4 md:grid-cols-[1fr_1fr_auto]"><div className="grid gap-2"><Label htmlFor="platform-name">Nome comercial</Label><Input id="platform-name" value={name} onChange={event => { setName(event.target.value); if (!slug) setSlug(normalizeSlug(event.target.value)); }} placeholder="Ex.: Ruidão Performance" /></div><div className="grid gap-2"><Label htmlFor="platform-slug">Identificador público</Label><Input id="platform-slug" value={slug} onChange={event => setSlug(normalizeSlug(event.target.value))} placeholder="ruidao-performance" /></div><div className="flex items-end"><Button className="w-full" disabled={create.isPending || name.trim().length < 3 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)} onClick={() => create.mutate({ name: name.trim(), slug })}><Plus className="mr-2 h-4 w-4" />{create.isPending ? "Criando…" : "Criar oficina"}</Button></div></CardContent></Card>

    <section className="grid gap-5 xl:grid-cols-[.9fr_1.1fr]"><Card className="border-slate-200 shadow-none"><CardHeader><CardTitle className="text-lg">{editingPlanId ? "Editar plano" : "Novo plano"}</CardTitle><CardDescription>Defina limites comerciais globais. Toda criação ou alteração é registrada na auditoria da plataforma.</CardDescription></CardHeader><CardContent className="grid gap-4"><div className="grid gap-2"><Label htmlFor="plan-code">Código</Label><Input id="plan-code" value={planForm.code} disabled={editingPlanId !== null} onChange={event => setPlanForm(current => ({ ...current, code: normalizeSlug(event.target.value) }))} placeholder="profissional" /></div><div className="grid gap-2"><Label htmlFor="plan-name">Nome</Label><Input id="plan-name" value={planForm.name} onChange={event => setPlanForm(current => ({ ...current, name: event.target.value }))} placeholder="Profissional" /></div><div className="grid gap-2"><Label htmlFor="plan-description">Descrição</Label><Input id="plan-description" value={planForm.description} onChange={event => setPlanForm(current => ({ ...current, description: event.target.value }))} placeholder="Recursos e limites principais" /></div><div className="grid grid-cols-2 gap-3"><div className="grid gap-2"><Label htmlFor="plan-users">Máx. usuários</Label><Input id="plan-users" type="number" min="1" value={planForm.maxUsers} onChange={event => setPlanForm(current => ({ ...current, maxUsers: event.target.value }))} /></div><div className="grid gap-2"><Label htmlFor="plan-customers">Máx. clientes</Label><Input id="plan-customers" type="number" min="1" value={planForm.maxCustomers} onChange={event => setPlanForm(current => ({ ...current, maxCustomers: event.target.value }))} placeholder="Ilimitado" /></div></div><label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={planForm.active} onChange={event => setPlanForm(current => ({ ...current, active: event.target.checked }))} />Plano disponível para atribuição</label><div className="flex gap-2"><Button disabled={createPlan.isPending || updatePlan.isPending} onClick={savePlan}>{editingPlanId ? "Salvar plano" : "Criar plano"}</Button>{editingPlanId ? <Button variant="outline" onClick={() => { setEditingPlanId(null); setPlanForm(emptyPlanForm); }}>Cancelar</Button> : null}</div></CardContent></Card>
      <Card className="border-slate-200"><CardHeader><CardTitle className="text-lg">Catálogo de planos</CardTitle><CardDescription>Planos ativos podem ser atribuídos às oficinas logo abaixo.</CardDescription></CardHeader><CardContent>{plans.isLoading ? <Skeleton className="h-48" /> : plans.data?.length ? <div className="grid gap-3 sm:grid-cols-2">{plans.data.map(plan => <article className="rounded-xl border border-slate-200 p-4" key={plan.id}><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-slate-950">{plan.name}</p><p className="mt-1 text-xs font-medium text-slate-500">{plan.code}</p></div><Badge variant="outline">{plan.active ? "Ativo" : "Inativo"}</Badge></div><p className="mt-3 min-h-10 text-sm text-slate-600">{plan.description ?? "Sem descrição operacional."}</p><p className="mt-3 text-xs text-slate-500">Até {plan.maxUsers} usuário(s) · {plan.maxCustomers === null ? "clientes ilimitados" : `até ${plan.maxCustomers} clientes`}</p><Button className="mt-4" size="sm" variant="outline" onClick={() => { setEditingPlanId(plan.id); setPlanForm(toPlanForm(plan)); }}><Pencil className="mr-2 h-4 w-4" />Editar</Button></article>)}</div> : <p className="py-8 text-center text-sm text-slate-500">Nenhum plano cadastrado. Crie o primeiro acima.</p>}</CardContent></Card></section>

    <Card className="border-slate-200"><CardHeader><CardTitle>Oficinas cadastradas</CardTitle><CardDescription>Ative, suspenda, reative e atribua planos sem misturar dados operacionais entre tenants.</CardDescription></CardHeader><CardContent>{tenants.isLoading ? <Skeleton className="h-32" /> : tenants.data?.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b text-xs uppercase tracking-[.08em] text-slate-500"><tr><th className="pb-3">Oficina</th><th className="pb-3">Status</th><th className="pb-3">Plano</th><th className="pb-3 text-right">Ação</th></tr></thead><tbody>{tenants.data.map(tenant => <tr className="border-b border-slate-100" key={tenant.id}><td className="py-4"><p className="font-medium text-slate-900">{tenant.name}</p><p className="text-xs text-slate-500">{tenant.slug}</p></td><td className="py-4"><Badge variant="outline">{tenant.active ? tenant.status : "inativa"}</Badge></td><td className="py-4"><select aria-label={`Plano da oficina ${tenant.name}`} className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500" value={tenant.planId ?? "none"} disabled={updateTenant.isPending} onChange={event => updateTenant.mutate({ tenantId: tenant.id, planId: event.target.value === "none" ? null : Number(event.target.value) })}><option value="none">Sem plano</option>{plans.data?.filter(plan => plan.active || plan.id === tenant.planId).map(plan => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></td><td className="py-4 text-right"><Button size="sm" variant="outline" disabled={updateTenant.isPending} onClick={() => updateTenant.mutate({ tenantId: tenant.id, active: !tenant.active, status: tenant.active ? "inactive" : "active" })}>{tenant.active ? "Desativar" : "Ativar"}</Button></td></tr>)}</tbody></table></div> : <p className="py-8 text-center text-sm text-slate-500">Nenhuma oficina cadastrada.</p>}</CardContent></Card>
    <Card className="border-slate-200"><CardHeader><CardTitle className="text-lg">Consumo por oficina</CardTitle><CardDescription>Leitura global de membros e clientes frente aos limites do plano atribuído. Esta visualização não concede acesso à operação interna do tenant.</CardDescription></CardHeader><CardContent>{usage.isLoading ? <Skeleton className="h-28" /> : usage.data?.length ? <div className="grid gap-3 lg:grid-cols-2">{usage.data.map(item => { const userRatio = item.plan ? item.memberCount / item.plan.maxUsers : null; const customerRatio = item.plan?.maxCustomers ? item.customerCount / item.plan.maxCustomers : null; const warning = (userRatio !== null && userRatio >= .8) || (customerRatio !== null && customerRatio >= .8); return <article className={`rounded-xl border p-4 ${warning ? "border-amber-200 bg-amber-50/40" : "border-slate-200"}`} key={item.tenantId}><div className="flex items-start justify-between gap-3"><div><p className="font-medium text-slate-950">{tenants.data?.find(tenant => tenant.id === item.tenantId)?.name ?? `Oficina #${item.tenantId}`}</p><p className="mt-1 text-xs text-slate-500">{item.plan?.name ?? "Sem plano atribuído"}</p></div><Badge variant="outline">{warning ? "Atenção" : "Dentro do limite"}</Badge></div><div className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><p className="text-xs uppercase tracking-wide text-slate-500">Membros</p><p className="mt-1 font-semibold text-slate-800">{item.memberCount}{item.plan ? ` / ${item.plan.maxUsers}` : ""}</p></div><div><p className="text-xs uppercase tracking-wide text-slate-500">Clientes</p><p className="mt-1 font-semibold text-slate-800">{item.customerCount}{item.plan?.maxCustomers ? ` / ${item.plan.maxCustomers}` : ""}</p></div></div></article>; })}</div> : <p className="py-8 text-center text-sm text-slate-500">Nenhum consumo de tenant disponível.</p>}</CardContent></Card>
    <PlatformReportCard />
    <PlatformUserManagementCard />
    <PlatformTenantAuditCard tenants={tenants.data ?? []} />
    <p className="flex items-center gap-2 text-xs text-slate-500"><CheckCircle2 className="h-4 w-4 text-emerald-600" />Ações globais exigem perfil Super Admin e mantêm rastreabilidade de quem realizou cada alteração.</p>
  </div></main>;
}
