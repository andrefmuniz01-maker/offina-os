import DashboardLayout, { type DashboardMenuItem } from "@/components/DashboardLayout";
import { SafeLink as Link } from "@/components/SafeLink";
import { CredentialsCard, type IssuedCredentials } from "@/components/CredentialsCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { getSupportTenantId, isDemoWorkspace, selectWorkspace } from "@/lib/demoWorkspace";
import { getTeamWorkspaceSummary } from "@/lib/teamWorkspace";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, CircleCheck, KeyRound, LockKeyhole, ShieldCheck, Trash2, UsersRound } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const menu: DashboardMenuItem[] = [
  { icon: ArrowLeft, label: "Visão geral", path: "/" },
  { icon: UsersRound, label: "Equipe", path: "/equipe" },
];

const roles = {
  owner: { label: "Dono", description: "Controle integral da oficina e do proprietário primário.", className: "border-amber-200 bg-amber-50 text-amber-800" },
  admin: { label: "Administrador", description: "Gerencia a operação e as configurações autorizadas.", className: "border-orange-200 bg-orange-50 text-orange-800" },
  attendant: { label: "Atendente", description: "Atende clientes, orçamentos e agenda operacional.", className: "border-sky-200 bg-sky-50 text-sky-800" },
  technician: { label: "Técnico", description: "Executa OS, checklist e consumo atribuído.", className: "border-emerald-200 bg-emerald-50 text-emerald-800" },
} as const;
type InviteRole = "admin" | "attendant" | "technician";

export default function Team() {
  const me = trpc.auth.me.useQuery();
  const mine = trpc.workspace.mine.useQuery();
  const tenant = selectWorkspace(mine.data, isDemoWorkspace(), getSupportTenantId())?.tenant;
  const tenantId = tenant?.id ?? 0;
  const utils = trpc.useUtils();
  const members = trpc.workspaceManagement.team.list.useQuery({ tenantId }, { enabled: Boolean(tenantId) });
  const summary = useMemo(
    () => getTeamWorkspaceSummary((members.data ?? []).map(({ member }) => ({ active: member.active, role: member.role }))),
    [members.data],
  );
  const myRole = members.data?.find(({ user }) => user.id === me.data?.id)?.member.role;
  const canManageTeam = myRole === "owner" || myRole === "admin";

  const [inviteForm, setInviteForm] = useState({ email: "", name: "", role: "attendant" as InviteRole, method: "password" as "password" | "email" });
  const [issued, setIssued] = useState<IssuedCredentials | null>(null);
  const invalidate = () => utils.workspaceManagement.team.list.invalidate({ tenantId });
  const invite = trpc.workspaceManagement.team.invite.useMutation({
    onSuccess: result => {
      if (result.temporaryPassword) { toast.success("Acesso criado. Envie a senha à pessoa."); setIssued({ email: result.email, temporaryPassword: result.temporaryPassword }); }
      else toast.success(result.invited ? "Convite enviado por e-mail para definir a senha." : "Acesso concedido (a pessoa já tinha conta e usa a senha dela).");
      setInviteForm(current => ({ ...current, email: "", name: "" }));
      invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const revoke = trpc.workspaceManagement.team.revoke.useMutation({
    onSuccess: () => { toast.success("Acesso revogado."); invalidate(); },
    onError: error => toast.error(error.message),
  });

  function canRevoke(targetUserId: string, targetRole: keyof typeof roles) {
    if (targetUserId === me.data?.id) return false;
    if (myRole === "owner") return targetRole !== "owner";
    if (myRole === "admin") return targetRole === "attendant" || targetRole === "technician";
    return false;
  }

  if (mine.isLoading) {
    return <DashboardLayout menuItems={menu} workspaceName="OficinaOS"><main className="mx-auto max-w-6xl"><Skeleton className="h-80" /></main></DashboardLayout>;
  }

  if (mine.error) {
    return <DashboardLayout menuItems={menu} workspaceName="OficinaOS"><main className="mx-auto max-w-3xl"><Card className="border-red-100 shadow-none"><CardHeader><CardTitle>Não foi possível carregar a oficina</CardTitle><CardDescription>{mine.error.message}</CardDescription></CardHeader></Card></main></DashboardLayout>;
  }

  if (!tenant || !tenantId) {
    return <DashboardLayout menuItems={menu} workspaceName="OficinaOS"><main className="mx-auto max-w-3xl"><Card className="shadow-none"><CardHeader><CardTitle>Associe-se a uma oficina</CardTitle><CardDescription>A equipe e as permissões pertencem a uma oficina ativa. Solicite ao administrador responsável o vínculo adequado antes de consultar este módulo.</CardDescription></CardHeader></Card></main></DashboardLayout>;
  }

  return <DashboardLayout menuItems={menu} workspaceName={tenant.name}>
    <main className="mx-auto max-w-6xl space-y-7">
      <header className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end">
        <div>
          <Link href="/"><a className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900"><ArrowLeft className="h-3.5 w-3.5" />Visão geral</a></Link>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Equipe e permissões</h1>
          <p className="mt-1 text-sm text-slate-500">Vínculos reais da oficina, consultados sob autorização do tenant.</p>
        </div>
        <Badge className="w-fit border border-slate-200 bg-white text-slate-700 hover:bg-white">Consulta protegida</Badge>
      </header>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-none" aria-label="Resumo da equipe">
        <div className="grid gap-px bg-slate-200 md:grid-cols-[1.35fr_repeat(3,minmax(0,1fr))]">
          <div className="bg-white p-5"><p className="text-xs font-semibold text-orange-700">Governança da equipe</p><p className="mt-2 text-xl font-semibold tracking-tight text-slate-950">Cada pessoa vê apenas o que precisa para trabalhar.</p><p className="mt-1 text-sm text-slate-600">Papéis e permissões são resolvidos no servidor e no banco, não nesta tela.</p></div>
          <div className="bg-white p-5"><p className="text-xs font-medium text-slate-500">Membros ativos</p><p className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">{summary.active}</p><p className="mt-1 text-xs text-slate-500">Com acesso operacional</p></div>
          <div className="bg-white p-5"><p className="text-xs font-medium text-slate-500">Administradores</p><p className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">{summary.admins}</p><p className="mt-1 text-xs text-slate-500">Dono e administradores ativos</p></div>
          <div className="bg-white p-5"><p className="text-xs font-medium text-slate-500">Acesso desativado</p><p className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">{summary.inactive}</p><p className="mt-1 text-xs text-slate-500">Vínculos preservados sem acesso</p></div>
        </div>
      </section>

      {issued ? <CredentialsCard credentials={issued} onClose={() => setIssued(null)} /> : null}

      {canManageTeam ? <Card className="border-slate-200 shadow-sm">
        <CardHeader><CardTitle className="text-lg">Convidar para a equipe</CardTitle><CardDescription>Quem ainda não tem conta recebe uma senha temporária para você repassar (e-mail ou WhatsApp). O papel de Proprietário só o Super Admin concede.</CardDescription></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-[1.2fr_1fr_.8fr_auto] sm:items-end">
          <div className="grid gap-1.5"><Label htmlFor="invite-email">E-mail</Label><Input id="invite-email" type="email" value={inviteForm.email} onChange={event => setInviteForm({ ...inviteForm, email: event.target.value })} placeholder="pessoa@oficina.com" /></div>
          <div className="grid gap-1.5"><Label htmlFor="invite-name">Nome (opcional)</Label><Input id="invite-name" value={inviteForm.name} onChange={event => setInviteForm({ ...inviteForm, name: event.target.value })} placeholder="Nome completo" /></div>
          <div className="grid gap-1.5"><Label htmlFor="invite-role">Papel</Label><select id="invite-role" className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm" value={inviteForm.role} onChange={event => setInviteForm({ ...inviteForm, role: event.target.value as InviteRole })}><option value="admin">Administrador</option><option value="attendant">Atendente</option><option value="technician">Técnico</option></select></div>
          <Button disabled={invite.isPending || !inviteForm.email.trim()} onClick={() => invite.mutate({ tenantId, email: inviteForm.email, name: inviteForm.name || undefined, role: inviteForm.role, method: inviteForm.method })}><KeyRound className="mr-2 h-4 w-4" />{invite.isPending ? "Convidando…" : "Convidar"}</Button>
          <div className="grid gap-1.5 sm:col-span-4 sm:grid-cols-[auto_1fr] sm:items-center"><Label htmlFor="invite-method" className="text-xs">Como a pessoa recebe o acesso</Label><select id="invite-method" className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm" value={inviteForm.method} onChange={event => setInviteForm({ ...inviteForm, method: event.target.value as "password" | "email" })}><option value="password">Gerar senha temporária (você envia por e-mail ou WhatsApp)</option><option value="email">Convite automático por e-mail</option></select></div>
        </CardContent>
      </Card> : null}

      <Card className="border-slate-200 shadow-none">
        <CardHeader>
          <div className="flex items-center justify-between gap-3"><div><CardTitle className="text-lg">Membros da oficina</CardTitle><CardDescription className="mt-1">{canManageTeam ? "Proprietário revoga Admin/Atendente/Técnico; Administrador revoga só Atendente/Técnico." : "Consulta protegida por permissão do servidor."}</CardDescription></div><ShieldCheck className="h-5 w-5 text-slate-500" /></div>
        </CardHeader>
        <CardContent>
          {members.isLoading ? <Skeleton className="h-48" /> : members.error ? <p className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700" role="alert">{members.error.message}</p> : members.data?.length ? <div className="space-y-3">{members.data.map(({ member, user }) => {
            const meta = roles[member.role];
            return <article className="flex flex-col gap-4 rounded-xl border border-slate-100 bg-white p-4 sm:flex-row sm:items-center sm:justify-between" key={member.userId}>
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-medium text-slate-950">{user.name ?? user.email ?? "Usuário sem identificação exibível"}</p><Badge variant="outline" className={member.active ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-slate-50 text-slate-600"}>{member.active ? "Ativo" : "Desativado"}</Badge></div><p className="mt-1 truncate text-xs text-slate-500">{user.email ?? "E-mail não informado"}</p><p className="mt-2 text-xs text-slate-500">{meta.description}</p></div>
              <div className="flex items-center gap-2"><Badge variant="outline" className={meta.className}>{meta.label}</Badge>{member.active && canRevoke(member.userId, member.role) ? <Button size="sm" variant="outline" className="text-red-700 hover:bg-red-50 hover:text-red-800" disabled={revoke.isPending} onClick={() => revoke.mutate({ tenantId, userId: member.userId })}><Trash2 className="mr-1.5 h-3.5 w-3.5" />Revogar</Button> : <span className="flex items-center gap-1 text-xs text-slate-500"><LockKeyhole className="h-3.5 w-3.5" />Gerenciado por fluxo autorizado</span>}</div>
            </article>;
          })}</div> : <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center"><CircleCheck className="mx-auto h-6 w-6 text-slate-400" /><p className="mt-2 text-sm font-medium text-slate-700">Nenhum membro vinculado.</p><p className="mt-1 text-xs text-slate-500">Convide o primeiro integrante pelo formulário acima.</p></div>}
        </CardContent>
      </Card>
    </main>
  </DashboardLayout>;
}
