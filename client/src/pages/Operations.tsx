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
import { trpc } from "@/lib/trpc";
import { yardMobileScrollHint, yardRegionLabel } from "@/lib/operationsRoutes";
import { Activity, AlertCircle, ArrowLeft, CalendarClock, CarFront, CircleCheck, Search, UsersRound, Wrench } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

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
  const mine = trpc.tenant.mine.useQuery();
  const tenant = mine.data?.[0]?.tenant;
  const tenantId = tenant?.id ?? 0;
  const role = (mine.data?.[0]?.membership.role ?? "technician") as WorkspaceRole;
  const canManageSchedule = canManageAppointments(role);
  const operationsScope = getOperationsScopeCopy(role);
  const utils = trpc.useUtils();

  const [agendaFrom, setAgendaFrom] = useState(() => dateInput(new Date()));
  const [agendaTo, setAgendaTo] = useState(defaultAgendaEnd);
  const [operationSearch, setOperationSearch] = useState("");
  const [quoteId, setQuoteId] = useState("");
  const [date, setDate] = useState("");
  const [bay, setBay] = useState("");
  const [assignedToUserId, setAssignedToUserId] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("60");

  const agendaRange = useMemo(
    () => ({ from: new Date(`${agendaFrom}T00:00:00.000Z`), to: new Date(`${agendaTo}T23:59:59.999Z`) }),
    [agendaFrom, agendaTo],
  );
  const appointments = trpc.appointments.list.useQuery(
    { tenantId, ...agendaRange, ...(operationSearch.trim() ? { search: operationSearch.trim() } : {}) },
    { enabled: Boolean(tenantId) && canManageSchedule && agendaRange.to >= agendaRange.from },
  );
  const yard = trpc.workOrders.kanban.useQuery({ tenantId, ...(operationSearch.trim() ? { search: operationSearch.trim() } : {}) }, { enabled: Boolean(tenantId) });
  const quotes = trpc.quotes.list.useQuery({ tenantId, status: "approved", page: 1, pageSize: 100 }, { enabled: Boolean(tenantId) && canManageSchedule });
  const members = trpc.tenant.members.list.useQuery({ tenantId }, { enabled: Boolean(tenantId) && canManageSchedule });

  const schedule = trpc.appointments.scheduleFromQuote.useMutation({
    onSuccess: data => {
      toast.success(`Agendamento criado e OS #${String(data.workOrderNumber ?? "").padStart(6, "0")} vinculada.`);
      setQuoteId("");
      setDate("");
      setBay("");
      setAssignedToUserId("");
      setDurationMinutes("60");
      utils.appointments.list.invalidate();
      utils.workOrders.kanban.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  const approved = quotes.data?.items ?? [];
  const appointmentItems = appointments.data ?? [];
  const yardItems = yard.data ?? [];
  const assignedAppointments = appointmentItems.filter(({ appointment }) => Boolean(appointment.assignedToUserId)).length;
  const bayAppointments = appointmentItems.filter(({ appointment }) => Boolean(appointment.bay)).length;
  const activeOrders = yardItems.filter(({ workOrder }) => workOrder.status !== "completed").length;
  const waitingOrders = yardItems.filter(({ workOrder }) => ["awaiting_approval", "awaiting_part"].includes(workOrder.status)).length;
  const submit = () => {
    const start = new Date(date);
    const duration = Number(durationMinutes);
    if (!quoteId || Number.isNaN(start.getTime()) || !Number.isFinite(duration) || duration < 5) {
      toast.error("Selecione um orçamento aprovado, uma data e uma duração válida.");
      return;
    }
    const end = new Date(start.getTime() + duration * 60 * 1000);
    schedule.mutate({
      tenantId,
      quoteId: Number(quoteId),
      scheduledStart: start,
      scheduledEnd: end,
      assignedToUserId: assignedToUserId ? Number(assignedToUserId) : undefined,
      bay: bay || undefined,
    });
  };

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

        {canManageSchedule ? <Card className="border-orange-100 bg-orange-50/40 shadow-sm">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div><CardTitle className="inline-flex items-center gap-2 text-lg"><CalendarClock className="h-4 w-4 text-orange-700" />Agendar orçamento aprovado</CardTitle>
            <CardDescription>O agendamento cria ou reutiliza a OS e herda cliente, veículo, itens e reserva sem redigitação.</CardDescription>
            </div><Badge variant="outline" className="w-fit border-orange-200 bg-white text-orange-800">Sem retrabalho</Badge>
          </CardHeader>
          <CardContent className="grid gap-3 lg:grid-cols-[1.4fr_1fr_.7fr_.8fr_.7fr_auto]">
            <div className="grid gap-2">
              <Label htmlFor="approved-quote">Orçamento aprovado</Label>
              <select id="approved-quote" className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm" value={quoteId} onChange={event => setQuoteId(event.target.value)}>
                <option value="">Selecione</option>
                {approved.map(({ quote, customer, vehicle }) => <option key={quote.id} value={quote.id}>#{String(quote.number).padStart(6, "0")} · {customer.name} · {vehicle.make} {vehicle.model}</option>)}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="appointment-start">Início</Label>
              <Input id="appointment-start" type="datetime-local" value={date} onChange={event => setDate(event.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="appointment-duration">Duração (min.)</Label>
              <Input id="appointment-duration" type="number" min="5" step="5" value={durationMinutes} onChange={event => setDurationMinutes(event.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="appointment-assignee">Profissional</Label>
              <select id="appointment-assignee" className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm" value={assignedToUserId} onChange={event => setAssignedToUserId(event.target.value)}>
                <option value="">A definir</option>
                {members.data?.filter(item => item.member.active).map(item => <option key={item.user.id} value={item.user.id}>{item.user.name ?? item.user.email ?? `Usuário ${item.user.id}`}</option>)}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="appointment-bay">Baia</Label>
              <Input id="appointment-bay" value={bay} onChange={event => setBay(event.target.value)} placeholder="Ex.: 02" />
            </div>
            <div className="flex items-end">
              <Button className="w-full" disabled={schedule.isPending || !quoteId || !date} onClick={submit}>{schedule.isPending ? "Agendando…" : "Agendar"}</Button>
            </div>
          </CardContent>
          {!approved.length && !quotes.isLoading ? <p className="px-6 pb-5 text-xs text-slate-500">Não há orçamento aprovado disponível para agendar.</p> : null}
        </Card> : <Card className="border-slate-200 bg-slate-50/70 shadow-sm"><CardHeader><CardTitle className="text-lg">Execução atribuída</CardTitle><CardDescription>Agendamentos, profissionais e baias são organizados pela equipe de atendimento. Use o pátio abaixo para abrir e atualizar somente as suas ordens de serviço.</CardDescription></CardHeader></Card>}

        {canManageSchedule ? <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-end sm:justify-between">
            <div><div className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-orange-700" /><h2 className="font-semibold text-slate-900">Próximos agendamentos</h2></div><p className="mt-1 text-xs text-slate-500">Filtre a agenda para distribuir profissionais e baias antes da chegada do veículo.</p></div>
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="grid gap-1 sm:col-span-3"><Label className="text-xs" htmlFor="operation-search">Buscar na agenda e pátio</Label><div className="relative"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" /><Input id="operation-search" className="pl-8" value={operationSearch} onChange={event => setOperationSearch(event.target.value)} placeholder="Cliente, WhatsApp, placa ou veículo" aria-describedby="operation-search-help" aria-busy={appointments.isLoading || yard.isLoading} /></div><span id="operation-search-help" className="sr-only">Filtra a agenda e o pátio por cliente, WhatsApp, placa, marca ou modelo do veículo.</span></div>
              <div className="grid gap-1"><Label className="text-xs" htmlFor="agenda-from">De</Label><Input id="agenda-from" type="date" value={agendaFrom} onChange={event => setAgendaFrom(event.target.value)} /></div>
              <div className="grid gap-1"><Label className="text-xs" htmlFor="agenda-to">Até</Label><Input id="agenda-to" type="date" min={agendaFrom} value={agendaTo} onChange={event => setAgendaTo(event.target.value)} /></div>
            </div>
          </div>
          {agendaRange.to < agendaRange.from ? <Card className="border-red-200 bg-red-50"><CardContent className="p-4 text-sm text-red-900">A data final precisa ser igual ou posterior à data inicial.</CardContent></Card> : null}
          {agendaRange.to >= agendaRange.from && appointments.isLoading ? <div className="grid gap-3 md:grid-cols-2">{Array.from({ length: 2 }).map((_, index) => <Skeleton className="h-24" key={index} />)}</div> : null}
          {agendaRange.to >= agendaRange.from && appointments.isError ? <Card className="border-red-200 bg-red-50"><CardContent className="p-4 text-sm text-red-900">Não foi possível carregar os agendamentos desta oficina.</CardContent></Card> : null}
          {agendaRange.to >= agendaRange.from && !appointments.isLoading && !appointments.isError && appointmentItems.length ? <div className="grid gap-3 md:grid-cols-2">{appointmentItems.map(({ appointment, customer, vehicle, workOrder }) => { const nextAction = getOperationNextAction(appointment.status as YardQueueStatus); return <Card key={appointment.id} className="border-slate-200 shadow-sm"><CardContent className="p-4"><div className="flex justify-between gap-3"><div><p className="font-medium text-slate-950">{customer.name} · {vehicle.make} {vehicle.model}</p><p className="mt-1 text-sm text-slate-500">{new Date(appointment.scheduledStart).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}{appointment.bay ? ` · Baia ${appointment.bay}` : ""}</p></div><Badge variant="outline">{labels[appointment.status] ?? appointment.status}</Badge></div><div className="mt-3 rounded-lg bg-slate-50 px-3 py-2"><p className="text-xs font-semibold text-slate-800">{nextAction.title}</p><p className="mt-1 text-xs text-slate-500">{nextAction.description}</p></div>{workOrder ? <Link href={`/os/${workOrder.id}`}><a className="mt-3 inline-block text-xs font-medium text-orange-700 hover:text-orange-900">Abrir OS #{String(workOrder.number).padStart(6, "0")} →</a></Link> : null}</CardContent></Card>; })}</div> : null}
          {agendaRange.to >= agendaRange.from && !appointments.isLoading && !appointments.isError && !appointmentItems.length ? <Card className="border-dashed border-slate-300 bg-gradient-to-b from-white to-orange-50/40"><CardHeader><CardTitle className="text-base">Nenhum agendamento neste filtro</CardTitle><CardDescription>Ajuste a busca ou o período. Após a aprovação de um orçamento, o agendamento cria ou reutiliza a OS vinculada sem redigitação.</CardDescription></CardHeader></Card> : null}
        </section> : null}

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex flex-col gap-2 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><Wrench className="h-4 w-4 text-orange-700" /><h2 className="font-semibold text-slate-900">{operationsScope.heading}</h2></div><p className="mt-1 text-xs text-slate-500">{operationsScope.description}</p></div><Badge variant="outline" className="w-fit"><Activity className="mr-1.5 h-3.5 w-3.5" />{activeOrders} em andamento</Badge></div>
          <p className="mb-2 text-xs text-slate-500 sm:hidden">{yardMobileScrollHint}</p>
          {yard.isLoading ? <div className="flex gap-3 overflow-hidden">{Array.from({ length: 4 }).map((_, index) => <Skeleton className="h-52 min-w-56" key={index} />)}</div> : null}
          {!yard.isLoading ? <div className="flex gap-3 overflow-x-auto pb-3 outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2" tabIndex={0} role="region" aria-label={yardRegionLabel}>{columns.map(status => {
            const orders = yard.data?.filter(item => item.workOrder.status === status) ?? [];
            return <div className="w-64 shrink-0" key={status}><div className="mb-2 flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-[.1em] text-slate-500">{labels[status]}</p><Badge variant="secondary">{orders.length}</Badge></div><div className={`min-h-40 space-y-2 rounded-xl border p-2 ${getYardStatusTone(status)}`}>{orders.map(({ workOrder, vehicle, customer }) => { const nextAction = getOperationNextAction(workOrder.status as YardQueueStatus); return <Link href={`/os/${workOrder.id}`} key={workOrder.id}><a className="block rounded-xl border border-slate-200 bg-white shadow-sm transition hover:border-orange-200"><CardContent className="p-3"><p className="text-xs text-slate-500">OS #{String(workOrder.number).padStart(6, "0")}</p><p className="mt-1 font-medium text-slate-900">{vehicle.make} {vehicle.model}</p><p className="mt-1 text-xs text-slate-500">{customer.name}</p><p className="mt-2 border-t border-slate-100 pt-2 text-[11px] font-medium text-orange-800">{nextAction.title}</p></CardContent></a></Link>; })}{!orders.length ? <div className="grid min-h-24 place-items-center text-center text-xs text-slate-400"><CarFront className="mb-1 h-4 w-4" />Sem veículos</div> : null}</div></div>;
          })}</div> : null}
        </section>
      </main>
    </DashboardLayout>
  );
}
