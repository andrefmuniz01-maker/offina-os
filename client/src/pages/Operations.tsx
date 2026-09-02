import { AgendaCalendar } from "@/components/AgendaCalendar";
import DashboardLayout, { type DashboardMenuItem } from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { SafeLink as Link } from "@/components/SafeLink";
import { getOperationNextAction, getYardStatusTone, type YardQueueStatus } from "@/lib/operationsQueue";
import { canManageAppointments, getOperationsScopeCopy } from "@/lib/operationAccess";
import type { WorkspaceRole } from "@/lib/homeWorkspace";
import { isDemoWorkspace, selectWorkspace } from "@/lib/demoWorkspace";
import { trpc } from "@/lib/trpc";
import { yardMobileScrollHint, yardRegionLabel } from "@/lib/operationsRoutes";
import { Activity, AlertCircle, ArrowLeft, CalendarClock, CarFront, CircleCheck, Search, UsersRound, Wrench } from "lucide-react";
import { useMemo, useState } from "react";

const menu: DashboardMenuItem[] = [
  { icon: ArrowLeft, label: "Visão geral", path: "/" },
  { icon: CalendarClock, label: "Agenda & pátio", path: "/operacao" },
];

const columns = ["scheduled", "received", "diagnosis", "awaiting_approval", "awaiting_part", "in_service", "completed"] as const;
const labels: Record<string, string> = {
  scheduled: "Agendado",
  received: "Recebido",
  diagnosis: "Diagnóstico",
  awaiting_approval: "Aguardando aprovação",
  awaiting_part: "Aguardando peça",
  in_service: "Em serviço",
  completed: "Finalizado",
  confirmed: "Confirmado",
  delivered: "Entregue",
};

const dateInput = (date: Date) => date.toISOString().slice(0, 10);

function defaultAgendaEnd() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 30);
  return dateInput(date);
}

export default function Operations() {
  const demoMode = isDemoWorkspace();
  const mine = trpc.workspace.mine.useQuery();
  const workspace = selectWorkspace(mine.data, demoMode);
  const tenant = workspace?.tenant;
  const tenantId = tenant?.id ?? 0;
  const role = (demoMode ? "owner" : workspace?.membership?.role ?? "technician") as WorkspaceRole;
  const canManageSchedule = canManageAppointments(role);
  const operationsScope = getOperationsScopeCopy(role);
  const utils = trpc.useUtils();

  const [agendaFrom, setAgendaFrom] = useState(() => dateInput(new Date()));
  const [agendaTo, setAgendaTo] = useState(defaultAgendaEnd);
  const [operationSearch, setOperationSearch] = useState("");

  const agendaRange = useMemo(
    () => ({ from: new Date(`${agendaFrom}T00:00:00.000Z`), to: new Date(`${agendaTo}T23:59:59.999Z`) }),
    [agendaFrom, agendaTo],
  );
  const appointments = trpc.workspaceOperations.listAppointments.useQuery(
    { tenantId, from: agendaRange.from.toISOString(), to: agendaRange.to.toISOString(), ...(operationSearch.trim() ? { search: operationSearch.trim() } : {}) },
    { enabled: Boolean(tenantId) && canManageSchedule && agendaRange.to >= agendaRange.from },
  );
  const yard = trpc.workspaceOperations.listYard.useQuery({ tenantId, ...(operationSearch.trim() ? { search: operationSearch.trim() } : {}) }, { enabled: Boolean(tenantId) });
  const appointmentItems = appointments.data ?? [];
  const yardItems = yard.data ?? [];
  const assignedAppointments = appointmentItems.filter(({ appointment }) => Boolean(appointment.assignedToUserId)).length;
  const activeOrders = yardItems.filter(({ workOrder }) => workOrder.status !== "completed").length;
  const waitingOrders = yardItems.filter(({ workOrder }) => ["awaiting_approval", "awaiting_part"].includes(workOrder.status)).length;

  if (!mine.isLoading && !tenant) {
    return (
      <DashboardLayout menuItems={menu} workspaceName="OficinaOS">
        <main className="mx-auto max-w-7xl space-y-7">
          <header className="border-b border-slate-200 pb-6">
            <Link href="/"><a className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900"><ArrowLeft className="h-3.5 w-3.5" />Visão geral</a></Link>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Agenda e pátio</h1>
          </header>
          <Card className="border-dashed border-slate-300">
            <CardContent className="p-8 text-center text-sm text-slate-600">
              Seu acesso ainda não está vinculado a uma oficina. Peça a um Super Admin para associá-lo ao tenant correto antes de agendar serviços ou consultar o pátio.
            </CardContent>
          </Card>
        </main>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout menuItems={menu} workspaceName={tenant?.name ?? "OficinaOS"}>
      <main className="mx-auto max-w-7xl space-y-7">
        <header className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end">
          <div>
            <Link href="/"><a className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900"><ArrowLeft className="h-3.5 w-3.5" />Visão geral</a></Link>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Agenda e pátio</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">{canManageSchedule ? "Planeje a capacidade, acompanhe cada veículo e mantenha a execução em movimento sem duplicar dados do orçamento." : "Acompanhe a execução das suas ordens de serviço sem abrir dados ou ações de escala da oficina."}</p>
          </div>
          <Badge className="w-fit bg-orange-100 text-orange-800 hover:bg-orange-100">Operação conectada</Badge>
        </header>

        <section className="overflow-hidden rounded-2xl border border-orange-100 bg-gradient-to-br from-orange-50 via-white to-white shadow-sm" aria-label="Resumo da operação"><div className="grid gap-px bg-orange-100 md:grid-cols-[1.35fr_repeat(3,minmax(0,1fr))]"><div className="bg-white/80 p-5"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-700">Pulso operacional</p><p className="mt-2 text-xl font-semibold tracking-tight text-slate-950">{canManageSchedule ? "Controle pátio, capacidade e execução." : "Acompanhe suas ordens em execução."}</p><p className="mt-1 text-sm text-slate-600">Os números refletem os veículos disponíveis neste escopo.</p></div><div className="bg-white p-5"><p className="text-xs font-medium text-slate-500">{canManageSchedule ? "Agenda no período" : "OS atribuídas"}</p><p className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">{canManageSchedule ? appointmentItems.length : yardItems.length}</p><p className="mt-1 text-xs text-slate-500">{canManageSchedule ? `${assignedAppointments} com profissional definido` : "Apenas veículos atribuídos ao seu perfil"}</p></div><div className="bg-white p-5"><p className="text-xs font-medium text-slate-500">Em execução</p><p className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">{activeOrders}</p><p className="mt-1 text-xs text-slate-500">Veículos ainda no fluxo de pátio</p></div><div className="bg-white p-5"><p className="text-xs font-medium text-slate-500">Aguardando avanço</p><p className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">{waitingOrders}</p><p className="mt-1 text-xs text-slate-500">Aprovação ou peça antes da execução</p></div></div></section>

        {canManageSchedule ? <Card className="border-orange-100 bg-orange-50/40 shadow-sm"><CardContent className="flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium text-slate-950">Agendamento derivado da proposta</p><p className="mt-1 text-sm text-slate-600">Abra uma proposta aprovada em Orçamentos para definir data, duração, baia e observações sem redigitar os dados comerciais.</p></div><Link href="/orcamentos"><a className="inline-flex h-9 items-center rounded-md bg-slate-950 px-3 text-sm font-medium text-white hover:bg-slate-800">Ir para orçamentos</a></Link></CardContent></Card> : <Card className="border-slate-200 bg-slate-50/70 shadow-sm"><CardHeader><CardTitle className="text-lg">Execução atribuída</CardTitle><CardDescription>Agendamentos, profissionais e baias são organizados pela equipe de atendimento. Use o pátio abaixo para acompanhar somente as suas ordens de serviço.</CardDescription></CardHeader></Card>}

        {canManageSchedule ? <AgendaCalendar tenantId={tenantId} /> : null}

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex flex-col gap-2 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><Wrench className="h-4 w-4 text-orange-700" /><h2 className="font-semibold text-slate-900">{operationsScope.heading}</h2></div><p className="mt-1 text-xs text-slate-500">{operationsScope.description}</p></div><div className="flex items-center gap-3"><div className="grid gap-1"><Label className="sr-only" htmlFor="yard-search">Buscar no pátio</Label><div className="relative"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" /><Input id="yard-search" className="w-52 pl-8" value={operationSearch} onChange={event => setOperationSearch(event.target.value)} placeholder="Cliente, placa ou veículo" /></div></div><Badge variant="outline" className="w-fit"><Activity className="mr-1.5 h-3.5 w-3.5" />{activeOrders} em andamento</Badge></div></div>
          <p className="mb-2 text-xs text-slate-500 sm:hidden">{yardMobileScrollHint}</p>
          {yard.isLoading ? <div className="flex gap-3 overflow-hidden">{Array.from({ length: 4 }).map((_, index) => <Skeleton className="h-52 min-w-56" key={index} />)}</div> : null}
          {!yard.isLoading ? <div className="flex gap-3 overflow-x-auto pb-3 outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2" tabIndex={0} role="region" aria-label={yardRegionLabel}>{columns.map(status => {
            const orders = yard.data?.filter(item => item.workOrder.status === status) ?? [];
            return <div className="w-64 shrink-0" key={status}><div className="mb-2 flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-[.1em] text-slate-500">{labels[status]}</p><Badge variant="secondary">{orders.length}</Badge></div><div className={`min-h-40 space-y-2 rounded-xl border p-2 ${getYardStatusTone(status)}`}>{orders.map(({ workOrder, vehicle, customer }) => { const nextAction = getOperationNextAction(workOrder.status as YardQueueStatus); return <article className="block rounded-xl border border-slate-200 bg-white shadow-sm" key={workOrder.id}><CardContent className="p-3"><p className="text-xs text-slate-500">OS #{String(workOrder.number).padStart(6, "0")}</p><p className="mt-1 font-medium text-slate-900">{vehicle.make} {vehicle.model}</p><p className="mt-1 text-xs text-slate-500">{customer.name}</p><p className="mt-2 border-t border-slate-100 pt-2 text-[11px] font-medium text-orange-800">{nextAction.title}</p></CardContent></article>; })}{!orders.length ? <div className="grid min-h-24 place-items-center text-center text-xs text-slate-400"><CarFront className="mb-1 h-4 w-4" />Sem veículos</div> : null}</div></div>;
          })}</div> : null}
        </section>
      </main>
    </DashboardLayout>
  );
}
