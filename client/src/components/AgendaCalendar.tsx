import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { CalendarClock, ChevronLeft, ChevronRight, Plus, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const SLOT_MINUTES = 30;
const GRID_START_HOUR = 7;
const GRID_END_HOUR = 20;

const statusLabels: Record<string, string> = {
  scheduled: "Agendado", confirmed: "Confirmado", received: "Recebido", diagnosis: "Diagnóstico",
  awaiting_approval: "Aguardando aprovação", awaiting_part: "Aguardando peça", in_service: "Em serviço",
  completed: "Finalizado", delivered: "Entregue", cancelled: "Cancelado",
};

const timeFormat = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
const dateHeaderFormat = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
const fullDateFormat = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long" });

function startOfDay(date: Date) { const d = new Date(date); d.setHours(0, 0, 0, 0); return d; }
function addDays(date: Date, days: number) { const d = new Date(date); d.setDate(d.getDate() + days); return d; }
function startOfWeek(date: Date) { const d = startOfDay(date); const day = d.getDay(); return addDays(d, day === 0 ? -6 : 1 - day); }
function toDatetimeLocalValue(date: Date) { const pad = (n: number) => String(n).padStart(2, "0"); return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`; }

type CalendarAppointment = {
  id: number; bayId: number | null; bayName: string | null; status: string;
  scheduledStart: string; scheduledEnd: string; promisedDeliveryAt: string | null;
  customerName: string; vehicleName: string; workOrderId: number | null; notes: string | null;
};

type Bay = { id: number; name: string; active: boolean; sortOrder: number };

function NewAppointmentDialog({ tenantId, initial, onClose }: { tenantId: number; initial: { bayId?: number; start?: Date }; onClose: () => void }) {
  const utils = trpc.useUtils();
  const bays = trpc.workspaceManagement.bays.list.useQuery({ tenantId });
  const services = trpc.workspaceCatalog.services.list.useQuery({ tenantId, page: 1, pageSize: 100 });
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [search, setSearch] = useState("");
  const customers = trpc.workspaceCustomers.listPaged.useQuery({ tenantId, page: 1, pageSize: 20, search: search.trim() || undefined }, { enabled: mode === "existing" });
  const [customerId, setCustomerId] = useState<number | null>(null);
  const vehicles = trpc.workspaceVehicles.listByCustomer.useQuery({ tenantId, customerId: customerId ?? 0 }, { enabled: Boolean(customerId) });
  const [vehicleId, setVehicleId] = useState<number | null>(null);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerWhatsapp, setNewCustomerWhatsapp] = useState("");
  const [newVehicleMake, setNewVehicleMake] = useState("");
  const [newVehicleModel, setNewVehicleModel] = useState("");
  const [newVehiclePlate, setNewVehiclePlate] = useState("");
  const [serviceIds, setServiceIds] = useState<number[]>([]);
  const [bayId, setBayId] = useState<number | undefined>(initial.bayId);
  const [start, setStart] = useState(() => toDatetimeLocalValue(initial.start ?? new Date()));
  const [promisedDeliveryAt, setPromisedDeliveryAt] = useState("");
  const [notes, setNotes] = useState("");

  const createCustomer = trpc.workspaceCustomers.create.useMutation({ onError: error => toast.error(error.message) });
  const createVehicle = trpc.workspaceVehicles.create.useMutation({ onError: error => toast.error(error.message) });
  const createAppointment = trpc.workspaceOperations.createManualAppointment.useMutation({
    onSuccess: () => {
      toast.success("Agendamento criado.");
      utils.workspaceOperations.calendar.invalidate();
      onClose();
    },
    onError: error => toast.error(error.message),
  });

  const selectedServices = (services.data ?? []).filter((service: { id: number }) => serviceIds.includes(service.id));
  const totalMinutes = selectedServices.reduce((sum: number, service: { estimatedMinutes: number }) => sum + service.estimatedMinutes, 0);
  const toggleService = (id: number) => setServiceIds(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);

  const isPending = createCustomer.isPending || createVehicle.isPending || createAppointment.isPending;
  const canSubmit = Boolean(bayId) && serviceIds.length > 0 && start.length > 0 && (
    mode === "existing" ? Boolean(customerId && vehicleId) : Boolean(newCustomerName.trim() && newCustomerWhatsapp.trim() && newVehicleMake.trim() && newVehicleModel.trim())
  );

  async function submit() {
    try {
      let resolvedCustomerId = customerId;
      let resolvedVehicleId = vehicleId;
      if (mode === "new") {
        const customer = await createCustomer.mutateAsync({ tenantId, name: newCustomerName.trim(), whatsapp: newCustomerWhatsapp.trim() });
        resolvedCustomerId = customer.id;
        const vehicle = await createVehicle.mutateAsync({ tenantId, customerId: customer.id, make: newVehicleMake.trim(), model: newVehicleModel.trim(), plate: newVehiclePlate.trim() || undefined });
        resolvedVehicleId = vehicle.id;
      }
      if (!resolvedCustomerId || !resolvedVehicleId || !bayId) return;
      await createAppointment.mutateAsync({
        tenantId, customerId: resolvedCustomerId, vehicleId: resolvedVehicleId, serviceIds,
        scheduledStart: new Date(start).toISOString(), bayId,
        promisedDeliveryAt: promisedDeliveryAt ? new Date(promisedDeliveryAt).toISOString() : undefined,
        notes: notes.trim() || undefined,
      });
    } catch {
      // erros já são reportados via onError de cada mutation
    }
  }

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo agendamento</DialogTitle>
          <DialogDescription>Cria a ordem de serviço e reserva a baia no horário escolhido.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-2">
            <Button type="button" size="sm" variant={mode === "existing" ? "default" : "outline"} onClick={() => setMode("existing")}>Cliente existente</Button>
            <Button type="button" size="sm" variant={mode === "new" ? "default" : "outline"} onClick={() => setMode("new")}><UserPlus className="mr-1.5 h-3.5 w-3.5" />Cliente novo</Button>
          </div>

          {mode === "existing" ? (
            <div className="space-y-3">
              <div className="grid gap-1.5"><Label htmlFor="agenda-customer-search">Buscar cliente</Label><Input id="agenda-customer-search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Nome ou WhatsApp" /></div>
              <div className="grid gap-1.5">
                <Label htmlFor="agenda-customer-select">Cliente</Label>
                <Select value={customerId ? String(customerId) : undefined} onValueChange={value => { setCustomerId(Number(value)); setVehicleId(null); }}>
                  <SelectTrigger id="agenda-customer-select"><SelectValue placeholder={customers.isLoading ? "Carregando…" : "Selecione um cliente"} /></SelectTrigger>
                  <SelectContent>{(customers.data?.items ?? []).map(customer => <SelectItem key={customer.id} value={String(customer.id)}>{customer.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {customerId ? <div className="grid gap-1.5">
                <Label htmlFor="agenda-vehicle-select">Veículo</Label>
                <Select value={vehicleId ? String(vehicleId) : undefined} onValueChange={value => setVehicleId(Number(value))}>
                  <SelectTrigger id="agenda-vehicle-select"><SelectValue placeholder={vehicles.isLoading ? "Carregando…" : "Selecione um veículo"} /></SelectTrigger>
                  <SelectContent>{(vehicles.data ?? []).map(vehicle => <SelectItem key={vehicle.id} value={String(vehicle.id)}>{vehicle.make} {vehicle.model}{vehicle.plate ? ` · ${vehicle.plate}` : ""}</SelectItem>)}</SelectContent>
                </Select>
              </div> : null}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5 sm:col-span-2"><Label htmlFor="agenda-new-customer-name">Nome do cliente</Label><Input id="agenda-new-customer-name" value={newCustomerName} onChange={event => setNewCustomerName(event.target.value)} /></div>
              <div className="grid gap-1.5 sm:col-span-2"><Label htmlFor="agenda-new-customer-whatsapp">WhatsApp</Label><Input id="agenda-new-customer-whatsapp" value={newCustomerWhatsapp} onChange={event => setNewCustomerWhatsapp(event.target.value)} /></div>
              <div className="grid gap-1.5"><Label htmlFor="agenda-new-vehicle-make">Marca</Label><Input id="agenda-new-vehicle-make" value={newVehicleMake} onChange={event => setNewVehicleMake(event.target.value)} /></div>
              <div className="grid gap-1.5"><Label htmlFor="agenda-new-vehicle-model">Modelo</Label><Input id="agenda-new-vehicle-model" value={newVehicleModel} onChange={event => setNewVehicleModel(event.target.value)} /></div>
              <div className="grid gap-1.5 sm:col-span-2"><Label htmlFor="agenda-new-vehicle-plate">Placa (opcional)</Label><Input id="agenda-new-vehicle-plate" value={newVehiclePlate} onChange={event => setNewVehiclePlate(event.target.value)} /></div>
            </div>
          )}

          <div className="grid gap-1.5">
            <Label>Serviços (definem a duração)</Label>
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
              {services.isLoading ? <Skeleton className="h-8" /> : null}
              {(services.data ?? []).map((service: { id: number; name: string; estimatedMinutes: number; laborPrice: number }) => (
                <label key={service.id} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-slate-50">
                  <span className="flex items-center gap-2"><Checkbox checked={serviceIds.includes(service.id)} onCheckedChange={() => toggleService(service.id)} />{service.name}</span>
                  <span className="text-xs text-slate-500">{service.estimatedMinutes} min</span>
                </label>
              ))}
            </div>
            {totalMinutes > 0 ? <p className="text-xs text-slate-500">Duração total: {totalMinutes} min</p> : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="agenda-bay-select">Baia</Label>
              <Select value={bayId ? String(bayId) : undefined} onValueChange={value => setBayId(Number(value))}>
                <SelectTrigger id="agenda-bay-select"><SelectValue placeholder={bays.isLoading ? "Carregando…" : "Selecione a baia"} /></SelectTrigger>
                <SelectContent>{(bays.data ?? []).filter(bay => bay.active).map(bay => <SelectItem key={bay.id} value={String(bay.id)}>{bay.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5"><Label htmlFor="agenda-start">Início</Label><Input id="agenda-start" type="datetime-local" value={start} onChange={event => setStart(event.target.value)} /></div>
          </div>
          <div className="grid gap-1.5"><Label htmlFor="agenda-promised">Previsão de entrega (opcional)</Label><Input id="agenda-promised" type="datetime-local" value={promisedDeliveryAt} onChange={event => setPromisedDeliveryAt(event.target.value)} /></div>
          <div className="grid gap-1.5"><Label htmlFor="agenda-notes">Observações (opcional)</Label><Textarea id="agenda-notes" value={notes} onChange={event => setNotes(event.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="button" disabled={!canSubmit || isPending} onClick={submit}>{isPending ? "Criando…" : "Criar agendamento"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AgendaCalendar({ tenantId }: { tenantId: number }) {
  const [view, setView] = useState<"day" | "week">("week");
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [newAppointment, setNewAppointment] = useState<{ bayId?: number; start?: Date } | null>(null);

  const rangeStart = view === "day" ? startOfDay(anchor) : startOfWeek(anchor);
  const rangeEnd = view === "day" ? addDays(rangeStart, 1) : addDays(rangeStart, 7);

  const bays = trpc.workspaceManagement.bays.list.useQuery({ tenantId }, { enabled: Boolean(tenantId) });
  const calendar = trpc.workspaceOperations.calendar.useQuery({ tenantId, from: rangeStart.toISOString(), to: rangeEnd.toISOString() }, { enabled: Boolean(tenantId) });
  const appointments = (calendar.data ?? []) as CalendarAppointment[];
  const activeBays = (bays.data ?? []).filter((bay: Bay) => bay.active);

  const navigate = (direction: -1 | 1) => setAnchor(current => addDays(current, direction * (view === "day" ? 1 : 7)));

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-orange-700" /><h2 className="font-semibold text-slate-900">Agenda</h2></div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1"><Button type="button" size="sm" variant={view === "day" ? "default" : "outline"} onClick={() => setView("day")}>Dia</Button><Button type="button" size="sm" variant={view === "week" ? "default" : "outline"} onClick={() => setView("week")}>Semana</Button></div>
          <div className="flex items-center gap-1"><Button type="button" size="icon" variant="outline" onClick={() => navigate(-1)} aria-label="Período anterior"><ChevronLeft className="h-4 w-4" /></Button><Button type="button" size="sm" variant="outline" onClick={() => setAnchor(startOfDay(new Date()))}>Hoje</Button><Button type="button" size="icon" variant="outline" onClick={() => navigate(1)} aria-label="Próximo período"><ChevronRight className="h-4 w-4" /></Button></div>
          <Button type="button" size="sm" onClick={() => setNewAppointment({ start: new Date() })}><Plus className="mr-1.5 h-4 w-4" />Novo agendamento</Button>
        </div>
      </div>

      {bays.isLoading || calendar.isLoading ? <Skeleton className="h-64" /> : null}
      {!bays.isLoading && !activeBays.length ? <Card className="border-dashed border-slate-300"><CardContent className="p-6 text-center text-sm text-slate-600">Cadastre ao menos uma baia em Configurações para começar a usar a agenda.</CardContent></Card> : null}

      {!bays.isLoading && !calendar.isLoading && activeBays.length ? (
        view === "day"
          ? <DayGrid day={rangeStart} bays={activeBays} appointments={appointments.filter(item => item.bayId !== null)} onSlotClick={(bayId, start) => setNewAppointment({ bayId, start })} />
          : <WeekAgenda weekStart={rangeStart} appointments={appointments} onCreateOnDay={date => setNewAppointment({ start: date })} />
      ) : null}

      {view === "day" && appointments.some(item => item.bayId === null) ? (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Sem baia definida</p>
          <p className="mb-2 text-xs text-slate-500">Agendamentos antigos, criados antes das baias serem cadastradas.</p>
          <div className="grid gap-2 sm:grid-cols-2">{appointments.filter(item => item.bayId === null).map(item => <AppointmentCard key={item.id} item={item} />)}</div>
        </div>
      ) : null}

      {newAppointment ? <NewAppointmentDialog tenantId={tenantId} initial={newAppointment} onClose={() => setNewAppointment(null)} /> : null}
    </section>
  );
}

function AppointmentCard({ item }: { item: CalendarAppointment }) {
  return (
    <Card className="border-slate-200 shadow-sm">
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div><p className="text-sm font-medium text-slate-900">{item.customerName} · {item.vehicleName}</p><p className="mt-0.5 text-xs text-slate-500">{timeFormat.format(new Date(item.scheduledStart))} – {timeFormat.format(new Date(item.scheduledEnd))}{item.bayName ? ` · ${item.bayName}` : ""}</p></div>
          <Badge variant="outline">{statusLabels[item.status] ?? item.status}</Badge>
        </div>
        {item.promisedDeliveryAt ? <p className="mt-2 text-xs font-medium text-orange-800">Entrega prevista: {new Date(item.promisedDeliveryAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</p> : null}
      </CardContent>
    </Card>
  );
}

function WeekAgenda({ weekStart, appointments, onCreateOnDay }: { weekStart: Date; appointments: CalendarAppointment[]; onCreateOnDay: (date: Date) => void }) {
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  return (
    <div className="grid gap-3 lg:grid-cols-7">
      {days.map(day => {
        const dayEnd = addDays(day, 1);
        const dayItems = appointments.filter(item => { const start = new Date(item.scheduledStart); return start >= day && start < dayEnd; }).sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart));
        const isToday = startOfDay(new Date()).getTime() === day.getTime();
        return (
          <div key={day.toISOString()} className={`rounded-xl border p-2 ${isToday ? "border-orange-300 bg-orange-50/40" : "border-slate-200"}`}>
            <div className="mb-2 flex items-center justify-between"><p className="text-xs font-semibold capitalize text-slate-700">{dateHeaderFormat.format(day)}</p><Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={() => onCreateOnDay(new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9, 0))} aria-label={`Novo agendamento em ${dateHeaderFormat.format(day)}`}><Plus className="h-3.5 w-3.5" /></Button></div>
            <div className="space-y-1.5">
              {dayItems.map(item => <div key={item.id} className="rounded-lg border border-slate-200 bg-white p-2 text-xs shadow-sm"><p className="font-medium text-slate-900">{timeFormat.format(new Date(item.scheduledStart))} {item.bayName ? `· ${item.bayName}` : ""}</p><p className="mt-0.5 text-slate-600">{item.customerName}</p><p className="text-slate-500">{item.vehicleName}</p></div>)}
              {!dayItems.length ? <p className="py-3 text-center text-[11px] text-slate-400">Sem agendamentos</p> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DayGrid({ day, bays, appointments, onSlotClick }: { day: Date; bays: Bay[]; appointments: CalendarAppointment[]; onSlotClick: (bayId: number, start: Date) => void }) {
  const slotCount = ((GRID_END_HOUR - GRID_START_HOUR) * 60) / SLOT_MINUTES;
  const slots = Array.from({ length: slotCount }, (_, index) => {
    const start = new Date(day); start.setHours(GRID_START_HOUR, index * SLOT_MINUTES, 0, 0);
    return start;
  });

  type CellInfo = { kind: "empty" } | { kind: "covered" } | { kind: "start"; item: CalendarAppointment; span: number };
  const grid = new Map<number, CellInfo[]>();
  for (const bay of bays) grid.set(bay.id, slots.map(() => ({ kind: "empty" as const })));

  for (const item of appointments) {
    if (item.bayId === null || !grid.has(item.bayId)) continue;
    const start = new Date(item.scheduledStart);
    const end = new Date(item.scheduledEnd);
    const startIdx = Math.max(0, Math.round((start.getTime() - slots[0].getTime()) / (SLOT_MINUTES * 60000)));
    const endIdx = Math.min(slotCount, Math.ceil((end.getTime() - slots[0].getTime()) / (SLOT_MINUTES * 60000)));
    if (startIdx >= slotCount || endIdx <= 0 || endIdx <= startIdx) continue;
    const column = grid.get(item.bayId)!;
    column[startIdx] = { kind: "start", item, span: endIdx - startIdx };
    for (let i = startIdx + 1; i < endIdx; i++) column[i] = { kind: "covered" };
  }

  return (
    <div className="overflow-x-auto">
      <p className="mb-2 text-sm font-medium capitalize text-slate-700">{fullDateFormat.format(day)}</p>
      <table className="w-full min-w-[560px] border-separate border-spacing-0 text-sm">
        <thead>
          <tr><th className="w-16 border-b border-r border-slate-200 p-2 text-xs font-medium text-slate-500"></th>{bays.map(bay => <th key={bay.id} className="border-b border-slate-200 p-2 text-xs font-semibold text-slate-700">{bay.name}</th>)}</tr>
        </thead>
        <tbody>
          {slots.map((slot, rowIndex) => (
            <tr key={slot.toISOString()}>
              <td className="border-b border-r border-slate-100 p-1 text-right text-[11px] text-slate-400">{rowIndex % 2 === 0 ? timeFormat.format(slot) : ""}</td>
              {bays.map(bay => {
                const cell = grid.get(bay.id)![rowIndex];
                if (cell.kind === "covered") return null;
                if (cell.kind === "start") return (
                  <td key={bay.id} rowSpan={cell.span} className="border-b border-l border-slate-100 p-1 align-top">
                    <div className="h-full rounded-lg border border-orange-200 bg-orange-50 p-1.5 text-[11px] leading-tight"><p className="font-medium text-slate-900">{cell.item.customerName}</p><p className="text-slate-600">{cell.item.vehicleName}</p><p className="mt-1 text-slate-500">{timeFormat.format(new Date(cell.item.scheduledStart))}–{timeFormat.format(new Date(cell.item.scheduledEnd))}</p></div>
                  </td>
                );
                return <td key={bay.id} className="cursor-pointer border-b border-l border-slate-100 p-1 align-top hover:bg-slate-50" onClick={() => onSlotClick(bay.id, slot)} />;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
