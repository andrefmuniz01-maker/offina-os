import DashboardLayout, { type DashboardMenuItem } from "@/components/DashboardLayout";
import { SafeLink as Link } from "@/components/SafeLink";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { getClientWorkspaceStep } from "@/lib/clientWorkspace";
import { trpc } from "@/lib/trpc";
import { isDemoWorkspace, selectWorkspace } from "@/lib/demoWorkspace";
import { ArrowLeft, Ban, CarFront, ChevronLeft, ChevronRight, ClipboardList, CircleUserRound, History, Pencil, Plus, Search, ShieldCheck, UsersRound } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const menu: DashboardMenuItem[] = [
  { icon: ArrowLeft, label: "Visão geral", path: "/" },
  { icon: UsersRound, label: "Clientes & veículos", path: "/clientes" },
];

type HistoryOrder = {
  id: number;
  number: number;
  status: string;
  createdAt: Date;
  deliveredAt: Date | null;
  vehicleMake?: string;
  vehicleModel?: string;
  vehiclePlate?: string | null;
  postSaleNotificationId?: number | null;
  postSaleTitle?: string | null;
  postSaleBody?: string | null;
  postSaleCreatedAt?: Date | null;
  postSaleLink?: string | null;
};

function HistoryRows({ orders, showVehicle = false }: { orders: HistoryOrder[]; showVehicle?: boolean }) {
  return <div className="divide-y divide-slate-100">{orders.map(order => <div className="flex flex-wrap items-start justify-between gap-3 py-3" key={order.id}>
    <div>
      <p className="font-medium text-slate-900">OS #{String(order.number).padStart(6, "0")}{showVehicle && order.vehicleMake ? ` · ${order.vehicleMake} ${order.vehicleModel}` : ""}</p>
      <p className="mt-1 text-xs text-slate-500">{showVehicle && order.vehiclePlate ? `${order.vehiclePlate} · ` : ""}Aberta em {new Date(order.createdAt).toLocaleDateString("pt-BR")}{order.deliveredAt ? ` · Entregue em ${new Date(order.deliveredAt).toLocaleDateString("pt-BR")}` : ""}</p>
      {order.postSaleTitle ? <div className="mt-3 rounded-lg border border-orange-100 bg-orange-50 px-3 py-2"><p className="text-xs font-semibold text-orange-900">{order.postSaleTitle}</p><p className="mt-1 text-xs leading-5 text-orange-800">{order.postSaleBody}</p>{order.postSaleLink ? <Link href={order.postSaleLink}><a className="mt-2 inline-flex text-xs font-semibold text-orange-800 underline underline-offset-2">Abrir OS e preparar acompanhamento</a></Link> : null}</div> : null}
    </div>
    <Badge variant="outline">{order.status.replaceAll("_", " ")}</Badge>
  </div>)}</div>;
}

const emptyCustomerForm = { name: "", whatsapp: "", email: "", document: "", notes: "" };
const emptyVehicleForm = { make: "", model: "", modelYear: "", plate: "" };

export default function Clients() {
  const mine = trpc.workspace.mine.useQuery();
  const tenant = selectWorkspace(mine.data, isDemoWorkspace())?.tenant;
  const tenantId = tenant?.id ?? 0;
  const utils = trpc.useUtils();
  const [customerId, setCustomerId] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerPage, setCustomerPage] = useState(1);
  const [vehicleId, setVehicleId] = useState<number | null>(null);
  const [vehicleForm, setVehicleForm] = useState(emptyVehicleForm);
  const [editingVehicleId, setEditingVehicleId] = useState<number | null>(null);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [customerForm, setCustomerForm] = useState(emptyCustomerForm);
  const [editingCustomer, setEditingCustomer] = useState(false);

  const customersInput = useMemo(() => ({ tenantId, page: customerPage, pageSize: 25, search: customerSearch.trim() || undefined }), [tenantId, customerPage, customerSearch]);
  const selectedCustomerId = Number(customerId);
  const vehiclesInput = useMemo(() => ({ tenantId, customerId: selectedCustomerId }), [tenantId, selectedCustomerId]);
  const vehicleHistoryInput = useMemo(() => ({ tenantId, vehicleId: vehicleId ?? 0 }), [tenantId, vehicleId]);
  const customerHistoryInput = useMemo(() => ({ tenantId, customerId: selectedCustomerId }), [tenantId, selectedCustomerId]);
  const customers = trpc.workspaceCustomers.listPaged.useQuery(customersInput, { enabled: Boolean(tenantId) });
  const vehicles = trpc.workspaceVehicles.listByCustomer.useQuery(vehiclesInput, { enabled: Boolean(tenantId && customerId) });
  const vehicleHistory = trpc.workspaceVehicles.workOrderHistory.useQuery(vehicleHistoryInput, { enabled: Boolean(tenantId && vehicleId) });
  const customerHistory = trpc.workspaceCustomers.workOrderHistory.useQuery(customerHistoryInput, { enabled: Boolean(tenantId && customerId) });

  const invalidateCustomers = () => utils.workspaceCustomers.listPaged.invalidate();
  const invalidateVehicles = () => utils.workspaceVehicles.listByCustomer.invalidate();

  const createCustomer = trpc.workspaceCustomers.create.useMutation({
    onSuccess: result => { toast.success("Cliente cadastrado."); setCustomerForm(emptyCustomerForm); setShowNewCustomer(false); invalidateCustomers(); setCustomerId(String(result.id)); },
    onError: error => toast.error(error.message),
  });
  const updateCustomer = trpc.workspaceCustomers.update.useMutation({
    onSuccess: () => { toast.success("Cliente atualizado."); setEditingCustomer(false); invalidateCustomers(); },
    onError: error => toast.error(error.message),
  });
  const setCustomerActive = trpc.workspaceCustomers.setActive.useMutation({
    onSuccess: result => { toast.success(result.active ? "Cliente reativado." : "Cliente desativado."); invalidateCustomers(); },
    onError: error => toast.error(error.message),
  });

  const createVehicle = trpc.workspaceVehicles.create.useMutation({
    onSuccess: () => { toast.success("Veículo cadastrado no histórico do cliente."); setVehicleForm(emptyVehicleForm); invalidateVehicles(); },
    onError: error => toast.error(error.message),
  });
  const updateVehicle = trpc.workspaceVehicles.update.useMutation({
    onSuccess: () => { toast.success("Veículo atualizado."); setVehicleForm(emptyVehicleForm); setEditingVehicleId(null); invalidateVehicles(); },
    onError: error => toast.error(error.message),
  });
  const setVehicleActive = trpc.workspaceVehicles.setActive.useMutation({
    onSuccess: result => { toast.success(result.active ? "Veículo reativado." : "Veículo desativado."); invalidateVehicles(); },
    onError: error => toast.error(error.message),
  });

  if (mine.isLoading) return <DashboardLayout menuItems={menu} workspaceName="OficinaOS"><main className="mx-auto max-w-6xl"><Skeleton className="h-96" /></main></DashboardLayout>;
  if (!tenant || !tenantId) return <DashboardLayout menuItems={menu} workspaceName="OficinaOS"><main className="mx-auto max-w-3xl"><Card><CardHeader><CardTitle>Associe-se a uma oficina</CardTitle><CardDescription>Clientes, veículos e históricos somente podem ser consultados dentro de uma oficina ativa.</CardDescription></CardHeader></Card></main></DashboardLayout>;

  const selectCustomer = (value: string) => {
    setCustomerId(value);
    setVehicleId(null);
    setEditingCustomer(false);
    setEditingVehicleId(null);
    setVehicleForm(emptyVehicleForm);
  };
  const customerItems = customers.data?.items ?? [];
  const vehicleItems = vehicles.data ?? [];
  const selectedCustomer = customerItems.find(customer => customer.id === selectedCustomerId);
  const workspaceStep = getClientWorkspaceStep(Boolean(customerId), vehicleItems.length, Boolean(vehicleId));

  const startEditVehicle = (vehicle: typeof vehicleItems[number]) => {
    setEditingVehicleId(vehicle.id);
    setVehicleForm({ make: vehicle.make, model: vehicle.model, modelYear: vehicle.modelYear ? String(vehicle.modelYear) : "", plate: vehicle.plate ?? "" });
  };
  const cancelEditVehicle = () => { setEditingVehicleId(null); setVehicleForm(emptyVehicleForm); };
  const submitVehicleForm = () => {
    if (editingVehicleId) {
      updateVehicle.mutate({ tenantId, vehicleId: editingVehicleId, make: vehicleForm.make, model: vehicleForm.model, modelYear: vehicleForm.modelYear ? Number(vehicleForm.modelYear) : undefined, plate: vehicleForm.plate || undefined });
    } else {
      createVehicle.mutate({ tenantId, customerId: selectedCustomerId, make: vehicleForm.make, model: vehicleForm.model, modelYear: vehicleForm.modelYear ? Number(vehicleForm.modelYear) : undefined, plate: vehicleForm.plate || undefined });
    }
  };

  return <DashboardLayout menuItems={menu} workspaceName={tenant.name}>
    <main className="mx-auto max-w-6xl space-y-7">
      <header className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end">
        <div><Link href="/"><a className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900"><ArrowLeft className="h-3.5 w-3.5" />Visão geral</a></Link><h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Clientes e veículos</h1><p className="mt-1 max-w-2xl text-sm text-slate-500">Encontre o proprietário, recupere o histórico do veículo e mantenha cada atendimento conectado à oficina.</p></div>
        <div className="flex items-center gap-2"><Badge className="w-fit bg-orange-100 text-orange-800 hover:bg-orange-100">Histórico protegido</Badge><Button size="sm" onClick={() => setShowNewCustomer(current => !current)}><Plus className="mr-1.5 h-4 w-4" />Novo cliente</Button></div>
      </header>

      {showNewCustomer ? <Card className="border-slate-200 shadow-sm">
        <CardHeader><CardTitle className="text-lg">Cadastrar cliente</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div className="grid gap-2"><Label htmlFor="new-customer-name">Nome</Label><Input id="new-customer-name" value={customerForm.name} onChange={event => setCustomerForm({ ...customerForm, name: event.target.value })} placeholder="Nome completo" /></div>
          <div className="grid gap-2"><Label htmlFor="new-customer-whatsapp">WhatsApp</Label><Input id="new-customer-whatsapp" value={customerForm.whatsapp} onChange={event => setCustomerForm({ ...customerForm, whatsapp: event.target.value })} placeholder="(11) 90000-0000" /></div>
          <div className="grid gap-2"><Label htmlFor="new-customer-email">E-mail (opcional)</Label><Input id="new-customer-email" type="email" value={customerForm.email} onChange={event => setCustomerForm({ ...customerForm, email: event.target.value })} /></div>
          <div className="sm:col-span-3"><Button disabled={createCustomer.isPending || customerForm.name.trim().length < 2 || customerForm.whatsapp.trim().length < 8} onClick={() => createCustomer.mutate({ tenantId, name: customerForm.name, whatsapp: customerForm.whatsapp, email: customerForm.email || undefined })}>{createCustomer.isPending ? "Cadastrando…" : "Cadastrar cliente"}</Button></div>
        </CardContent>
      </Card> : null}

      <section className="overflow-hidden rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50 via-white to-white shadow-sm" aria-label="Resumo do atendimento"><div className="grid gap-px bg-sky-100 md:grid-cols-[1.35fr_repeat(3,minmax(0,1fr))]"><div className="bg-white/80 p-5"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">Base do atendimento</p><p className="mt-2 text-xl font-semibold tracking-tight text-slate-950">Atenda com o histórico no contexto certo.</p><p className="mt-1 text-sm text-slate-600">A seleção e os dados exibidos permanecem rigorosamente dentro da oficina atual.</p></div><div className="bg-white p-5"><p className="text-xs font-medium text-slate-500">Clientes nesta página</p><p className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">{customerItems.length}</p><p className="mt-1 text-xs text-slate-500">Resultado da busca aplicada</p></div><div className="bg-white p-5"><p className="text-xs font-medium text-slate-500">Veículos do cliente</p><p className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">{vehicleItems.length}</p><p className="mt-1 text-xs text-slate-500">{selectedCustomer ? selectedCustomer.name : "Selecione um proprietário"}</p></div><div className="bg-white p-5"><p className="text-xs font-medium text-slate-500">Histórico operacional</p><p className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">{customerHistory.data?.length ?? 0}</p><p className="mt-1 text-xs text-slate-500">Ordens de serviço do cliente</p></div></div></section>

      <div className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader><CardTitle className="inline-flex items-center gap-2 text-lg"><Plus className="h-4 w-4 text-orange-700" />{editingVehicleId ? "Editar veículo" : "Novo veículo"}</CardTitle><CardDescription>Selecione o proprietário antes de cadastrar o veículo.</CardDescription></CardHeader>
          <CardContent className="grid gap-3">
            <div className="grid gap-2"><Label htmlFor="customer-search">Buscar cliente</Label><div className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><Input id="customer-search" className="pl-9" value={customerSearch} onChange={event => { setCustomerSearch(event.target.value); setCustomerPage(1); setCustomerId(""); setVehicleId(null); }} placeholder="Nome ou WhatsApp" /></div><p className="text-xs text-slate-500">A busca é aplicada somente aos clientes desta oficina.</p></div>
            <div className="grid gap-2"><Label htmlFor="vehicle-customer">Cliente</Label><select id="vehicle-customer" className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60" value={customerId} onChange={event => selectCustomer(event.target.value)} aria-describedby="vehicle-customer-help" aria-invalid={customers.isError} aria-busy={customers.isLoading} disabled={customers.isLoading || customers.isError}><option value="">{customers.isLoading ? "Buscando clientes…" : "Selecione"}</option>{customers.data?.items.map(customer => <option key={customer.id} value={customer.id}>{customer.name}{customer.active ? "" : " (inativo)"}</option>)}</select><p id="vehicle-customer-help" className="text-xs text-slate-500">A seleção limita veículos e históricos a este cliente nesta oficina.</p>{customers.data?.items.length ? <div className="flex items-center justify-between text-xs text-slate-500"><span>Página {customers.data.page}</span><span className="flex gap-1"><Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label="Página anterior de clientes" disabled={customerPage === 1} onClick={() => setCustomerPage(current => current - 1)}><ChevronLeft className="h-4 w-4" /></Button><Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label="Próxima página de clientes" disabled={!customers.data.hasMore} onClick={() => setCustomerPage(current => current + 1)}><ChevronRight className="h-4 w-4" /></Button></span></div> : null}</div>
            {customers.isError ? <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">Não foi possível carregar os clientes disponíveis.</p> : null}

            {selectedCustomer ? <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              {editingCustomer ? <div className="grid gap-2">
                <Input value={customerForm.name} onChange={event => setCustomerForm({ ...customerForm, name: event.target.value })} placeholder="Nome" />
                <Input value={customerForm.whatsapp} onChange={event => setCustomerForm({ ...customerForm, whatsapp: event.target.value })} placeholder="WhatsApp" />
                <Input type="email" value={customerForm.email} onChange={event => setCustomerForm({ ...customerForm, email: event.target.value })} placeholder="E-mail (opcional)" />
                <div className="flex gap-2"><Button size="sm" disabled={updateCustomer.isPending} onClick={() => updateCustomer.mutate({ tenantId, customerId: selectedCustomerId, name: customerForm.name, whatsapp: customerForm.whatsapp, email: customerForm.email || undefined })}>{updateCustomer.isPending ? "Salvando…" : "Salvar"}</Button><Button size="sm" variant="ghost" onClick={() => setEditingCustomer(false)}>Cancelar</Button></div>
              </div> : <div className="flex items-start justify-between gap-3">
                <div><p className="font-medium text-slate-900">{selectedCustomer.name}</p><p className="text-xs text-slate-500">{selectedCustomer.whatsapp}{selectedCustomer.email ? ` · ${selectedCustomer.email}` : ""}</p><Badge variant="outline" className={selectedCustomer.active ? "mt-1.5 border-emerald-200 bg-emerald-50 text-emerald-800" : "mt-1.5 border-slate-200 bg-slate-100 text-slate-600"}>{selectedCustomer.active ? "Ativo" : "Inativo"}</Badge></div>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => { setEditingCustomer(true); setCustomerForm({ name: selectedCustomer.name, whatsapp: selectedCustomer.whatsapp, email: selectedCustomer.email ?? "", document: selectedCustomer.document ?? "", notes: selectedCustomer.notes ?? "" }); }}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="outline" className={selectedCustomer.active ? "text-red-700 hover:bg-red-50 hover:text-red-800" : undefined} disabled={setCustomerActive.isPending} onClick={() => setCustomerActive.mutate({ tenantId, customerId: selectedCustomerId, active: !selectedCustomer.active })}>{selectedCustomer.active ? <Ban className="h-3.5 w-3.5" /> : "Reativar"}</Button>
                </div>
              </div>}
            </div> : null}

            <div className="grid grid-cols-2 gap-3"><div className="grid gap-2"><Label htmlFor="vehicle-make">Marca</Label><Input id="vehicle-make" value={vehicleForm.make} onChange={event => setVehicleForm({ ...vehicleForm, make: event.target.value })} placeholder="Ex.: BMW" /></div><div className="grid gap-2"><Label htmlFor="vehicle-model">Modelo</Label><Input id="vehicle-model" value={vehicleForm.model} onChange={event => setVehicleForm({ ...vehicleForm, model: event.target.value })} placeholder="Ex.: 320i" /></div></div>
            <div className="grid grid-cols-2 gap-3"><div className="grid gap-2"><Label htmlFor="vehicle-year">Ano</Label><Input id="vehicle-year" type="number" min="1900" max="2100" value={vehicleForm.modelYear} onChange={event => setVehicleForm({ ...vehicleForm, modelYear: event.target.value })} /></div><div className="grid gap-2"><Label htmlFor="vehicle-plate">Placa</Label><Input id="vehicle-plate" value={vehicleForm.plate} onChange={event => setVehicleForm({ ...vehicleForm, plate: event.target.value })} placeholder="ABC1D23" /></div></div>
            <div className="flex gap-2">
              <Button disabled={createVehicle.isPending || updateVehicle.isPending || !customerId || !vehicleForm.make || !vehicleForm.model} onClick={submitVehicleForm}><Plus className="mr-2 h-4 w-4" />{editingVehicleId ? (updateVehicle.isPending ? "Salvando…" : "Salvar edição") : (createVehicle.isPending ? "Cadastrando…" : "Cadastrar veículo")}</Button>
              {editingVehicleId ? <Button variant="ghost" onClick={cancelEditVehicle}>Cancelar</Button> : null}
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader><CardTitle className="inline-flex items-center gap-2 text-lg"><CarFront className="h-4 w-4 text-orange-700" />Veículos do cliente</CardTitle><CardDescription aria-live="polite">{customerId ? "Selecione um veículo para abrir seu histórico de execução." : "Selecione um cliente para consultar seus veículos."}</CardDescription></CardHeader>
          <CardContent>{vehicles.isLoading ? <Skeleton className="h-48" /> : vehicles.isError ? <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">Não foi possível carregar os veículos deste cliente.</p> : <><div className="mb-4 rounded-xl border border-slate-100 bg-slate-50 p-3"><p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500"><CircleUserRound className="h-3.5 w-3.5 text-orange-700" />Próxima ação</p><p className="mt-1 text-sm font-semibold text-slate-900">{workspaceStep.title}</p><p className="mt-1 text-xs leading-relaxed text-slate-500">{workspaceStep.description}</p></div>{vehicleItems.length ? <div className="space-y-2">{vehicleItems.map(vehicle => <div className={`flex items-center justify-between gap-2 rounded-xl border p-4 transition-colors ${vehicleId === vehicle.id ? "border-orange-300 bg-orange-50" : "border-slate-100"}`} key={vehicle.id}>
            <button className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left focus-visible:outline-none" onClick={() => setVehicleId(vehicle.id)} type="button" aria-pressed={vehicleId === vehicle.id}><div className="min-w-0"><p className="truncate font-medium text-slate-900">{vehicle.make} {vehicle.model}{vehicle.active ? "" : " (inativo)"}</p><p className="mt-1 text-xs text-slate-500">{vehicle.modelYear ?? "Ano não informado"}{vehicle.plate ? ` · ${vehicle.plate}` : ""}</p></div><CarFront className="h-5 w-5 shrink-0 text-orange-700" /></button>
            <div className="flex shrink-0 gap-1"><Button size="sm" variant="ghost" className="h-8 w-8 p-0" aria-label="Editar veículo" onClick={() => startEditVehicle(vehicle)}><Pencil className="h-3.5 w-3.5" /></Button><Button size="sm" variant="ghost" className={`h-8 w-8 p-0 ${vehicle.active ? "text-red-700 hover:text-red-800" : ""}`} aria-label={vehicle.active ? "Desativar veículo" : "Reativar veículo"} disabled={setVehicleActive.isPending} onClick={() => setVehicleActive.mutate({ tenantId, vehicleId: vehicle.id, active: !vehicle.active })}>{vehicle.active ? <Ban className="h-3.5 w-3.5" /> : <span className="text-xs">↺</span>}</Button></div>
          </div>)}</div> : <p className="py-8 text-center text-sm text-slate-500">{customerId ? "Nenhum veículo cadastrado para este cliente." : "Aguardando seleção de cliente."}</p>}</>}</CardContent>
        </Card>
      </div>

      {vehicleId || customerId ? <section className="grid gap-5 lg:grid-cols-2">{vehicleId ? <Card className="border-slate-200 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><History className="h-5 w-5 text-orange-700" />Histórico do veículo</CardTitle><CardDescription>Registros de execução deste veículo nesta oficina.</CardDescription></CardHeader><CardContent>{vehicleHistory.isLoading ? <Skeleton className="h-24" /> : vehicleHistory.isError ? <p className="text-sm text-red-700" role="alert">Não foi possível carregar o histórico deste veículo.</p> : vehicleHistory.data?.length ? <HistoryRows orders={vehicleHistory.data} /> : <p className="py-8 text-sm text-slate-500">Este veículo ainda não possui ordens de serviço registradas.</p>}</CardContent></Card> : null}{customerId ? <Card className="border-slate-200 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><ClipboardList className="h-5 w-5 text-orange-700" />Histórico operacional do cliente</CardTitle><CardDescription>Ordens de serviço e entregas de todos os veículos deste cliente nesta oficina.</CardDescription></CardHeader><CardContent>{customerHistory.isLoading ? <Skeleton className="h-24" /> : customerHistory.isError ? <p className="text-sm text-red-700" role="alert">Não foi possível carregar o histórico do cliente.</p> : customerHistory.data?.length ? <HistoryRows orders={customerHistory.data} showVehicle /> : <p className="py-8 text-sm text-slate-500">Este cliente ainda não possui ordens de serviço registradas.</p>}</CardContent></Card> : null}</section> : null}
    </main>
  </DashboardLayout>;
}
