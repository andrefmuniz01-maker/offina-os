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
import { ArrowLeft, CarFront, ChevronLeft, ChevronRight, ClipboardList, CircleUserRound, History, Plus, Search, ShieldCheck, UsersRound } from "lucide-react";
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

export default function Clients() {
  const mine = trpc.tenant.mine.useQuery();
  const tenant = mine.data?.[0]?.tenant;
  const tenantId = tenant?.id ?? 0;
  const utils = trpc.useUtils();
  const [customerId, setCustomerId] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerPage, setCustomerPage] = useState(1);
  const [vehicleId, setVehicleId] = useState<number | null>(null);
  const [form, setForm] = useState({ make: "", model: "", modelYear: "", plate: "" });

  const customersInput = useMemo(() => ({ tenantId, page: customerPage, pageSize: 25, search: customerSearch.trim() || undefined }), [tenantId, customerPage, customerSearch]);
  const selectedCustomerId = Number(customerId);
  const vehiclesInput = useMemo(() => ({ tenantId, customerId: selectedCustomerId }), [tenantId, selectedCustomerId]);
  const vehicleHistoryInput = useMemo(() => ({ tenantId, vehicleId: vehicleId ?? 0 }), [tenantId, vehicleId]);
  const customerHistoryInput = useMemo(() => ({ tenantId, customerId: selectedCustomerId }), [tenantId, selectedCustomerId]);
  const customers = trpc.customers.listPaged.useQuery(customersInput, { enabled: Boolean(tenantId) });
  const vehicles = trpc.vehicles.listByCustomer.useQuery(vehiclesInput, { enabled: Boolean(tenantId && customerId) });
  const vehicleHistory = trpc.vehicles.workOrderHistory.useQuery(vehicleHistoryInput, { enabled: Boolean(tenantId && vehicleId) });
  const customerHistory = trpc.customers.workOrderHistory.useQuery(customerHistoryInput, { enabled: Boolean(tenantId && customerId) });
  const create = trpc.vehicles.create.useMutation({
    onSuccess: () => {
      toast.success("Veículo cadastrado no histórico do cliente.");
      setForm({ make: "", model: "", modelYear: "", plate: "" });
      utils.vehicles.listByCustomer.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  if (mine.isLoading) return <DashboardLayout menuItems={menu} workspaceName="OficinaOS"><main className="mx-auto max-w-6xl"><Skeleton className="h-96" /></main></DashboardLayout>;
  if (!tenant || !tenantId) return <DashboardLayout menuItems={menu} workspaceName="OficinaOS"><main className="mx-auto max-w-3xl"><Card><CardHeader><CardTitle>Associe-se a uma oficina</CardTitle><CardDescription>Clientes, veículos e históricos somente podem ser consultados dentro de uma oficina ativa.</CardDescription></CardHeader></Card></main></DashboardLayout>;

  const selectCustomer = (value: string) => {
    setCustomerId(value);
    setVehicleId(null);
  };
  const customerItems = customers.data?.items ?? [];
  const vehicleItems = vehicles.data ?? [];
  const selectedCustomer = customerItems.find(customer => customer.id === selectedCustomerId);
  const workspaceStep = getClientWorkspaceStep(Boolean(customerId), vehicleItems.length, Boolean(vehicleId));

  return <DashboardLayout menuItems={menu} workspaceName={tenant.name}>
    <main className="mx-auto max-w-6xl space-y-7">
      <header className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end">
        <div><Link href="/"><a className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900"><ArrowLeft className="h-3.5 w-3.5" />Visão geral</a></Link><h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Clientes e veículos</h1><p className="mt-1 max-w-2xl text-sm text-slate-500">Encontre o proprietário, recupere o histórico do veículo e mantenha cada atendimento conectado à oficina.</p></div>
        <Badge className="w-fit bg-orange-100 text-orange-800 hover:bg-orange-100">Histórico protegido</Badge>
      </header>

      <section className="overflow-hidden rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50 via-white to-white shadow-sm" aria-label="Resumo do atendimento"><div className="grid gap-px bg-sky-100 md:grid-cols-[1.35fr_repeat(3,minmax(0,1fr))]"><div className="bg-white/80 p-5"><p className="text-xs font-semibold text-sky-700">Base do atendimento</p><p className="mt-2 text-xl font-semibold tracking-tight text-slate-950">Atenda com o histórico no contexto certo.</p><p className="mt-1 text-sm text-slate-600">A seleção e os dados exibidos permanecem rigorosamente dentro da oficina atual.</p></div><div className="bg-white p-5"><p className="text-xs font-medium text-slate-500">Clientes nesta página</p><p className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">{customerItems.length}</p><p className="mt-1 text-xs text-slate-500">Resultado da busca aplicada</p></div><div className="bg-white p-5"><p className="text-xs font-medium text-slate-500">Veículos do cliente</p><p className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">{vehicleItems.length}</p><p className="mt-1 text-xs text-slate-500">{selectedCustomer ? selectedCustomer.name : "Selecione um proprietário"}</p></div><div className="bg-white p-5"><p className="text-xs font-medium text-slate-500">Histórico operacional</p><p className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">{customerHistory.data?.length ?? 0}</p><p className="mt-1 text-xs text-slate-500">Ordens de serviço do cliente</p></div></div></section>

      <div className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader><CardTitle className="inline-flex items-center gap-2 text-lg"><Plus className="h-4 w-4 text-orange-700" />Novo veículo</CardTitle><CardDescription>Selecione o proprietário antes de cadastrar o veículo.</CardDescription></CardHeader>
          <CardContent className="grid gap-3">
            <div className="grid gap-2"><Label htmlFor="customer-search">Buscar cliente</Label><div className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><Input id="customer-search" className="pl-9" value={customerSearch} onChange={event => { setCustomerSearch(event.target.value); setCustomerPage(1); setCustomerId(""); setVehicleId(null); }} placeholder="Nome ou WhatsApp" /></div><p className="text-xs text-slate-500">A busca é aplicada somente aos clientes desta oficina.</p></div>
            <div className="grid gap-2"><Label htmlFor="vehicle-customer">Cliente</Label><select id="vehicle-customer" className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60" value={customerId} onChange={event => selectCustomer(event.target.value)} aria-describedby="vehicle-customer-help" aria-invalid={customers.isError} aria-busy={customers.isLoading} disabled={customers.isLoading || customers.isError}><option value="">{customers.isLoading ? "Buscando clientes…" : "Selecione"}</option>{customers.data?.items.map(customer => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select><p id="vehicle-customer-help" className="text-xs text-slate-500">A seleção limita veículos e históricos a este cliente nesta oficina.</p>{customers.data?.items.length ? <div className="flex items-center justify-between text-xs text-slate-500"><span>Página {customers.data.page}</span><span className="flex gap-1"><Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label="Página anterior de clientes" disabled={customerPage === 1} onClick={() => setCustomerPage(current => current - 1)}><ChevronLeft className="h-4 w-4" /></Button><Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label="Próxima página de clientes" disabled={!customers.data.hasMore} onClick={() => setCustomerPage(current => current + 1)}><ChevronRight className="h-4 w-4" /></Button></span></div> : null}</div>
            {customers.isError ? <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">Não foi possível carregar os clientes disponíveis.</p> : null}
            <div className="grid grid-cols-2 gap-3"><div className="grid gap-2"><Label htmlFor="vehicle-make">Marca</Label><Input id="vehicle-make" value={form.make} onChange={event => setForm({ ...form, make: event.target.value })} placeholder="Ex.: BMW" /></div><div className="grid gap-2"><Label htmlFor="vehicle-model">Modelo</Label><Input id="vehicle-model" value={form.model} onChange={event => setForm({ ...form, model: event.target.value })} placeholder="Ex.: 320i" /></div></div>
            <div className="grid grid-cols-2 gap-3"><div className="grid gap-2"><Label htmlFor="vehicle-year">Ano</Label><Input id="vehicle-year" type="number" min="1900" max="2100" value={form.modelYear} onChange={event => setForm({ ...form, modelYear: event.target.value })} /></div><div className="grid gap-2"><Label htmlFor="vehicle-plate">Placa</Label><Input id="vehicle-plate" value={form.plate} onChange={event => setForm({ ...form, plate: event.target.value })} placeholder="ABC1D23" /></div></div>
            <Button disabled={create.isPending || !customerId || !form.make || !form.model} onClick={() => create.mutate({ tenantId, customerId: selectedCustomerId, make: form.make, model: form.model, modelYear: form.modelYear ? Number(form.modelYear) : undefined, plate: form.plate || undefined })}><Plus className="mr-2 h-4 w-4" />{create.isPending ? "Cadastrando…" : "Cadastrar veículo"}</Button>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader><CardTitle className="inline-flex items-center gap-2 text-lg"><CarFront className="h-4 w-4 text-orange-700" />Veículos do cliente</CardTitle><CardDescription aria-live="polite">{customerId ? "Selecione um veículo para abrir seu histórico de execução." : "Selecione um cliente para consultar seus veículos."}</CardDescription></CardHeader>
          <CardContent>{vehicles.isLoading ? <Skeleton className="h-48" /> : vehicles.isError ? <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">Não foi possível carregar os veículos deste cliente.</p> : <><div className="mb-4 rounded-xl border border-slate-100 bg-slate-50 p-3"><p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500"><CircleUserRound className="h-3.5 w-3.5 text-orange-700" />Próxima ação</p><p className="mt-1 text-sm font-semibold text-slate-900">{workspaceStep.title}</p><p className="mt-1 text-xs leading-relaxed text-slate-500">{workspaceStep.description}</p></div>{vehicleItems.length ? <div className="space-y-2">{vehicleItems.map(vehicle => <button className={`flex w-full items-center justify-between rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 ${vehicleId === vehicle.id ? "border-orange-300 bg-orange-50" : "border-slate-100 hover:border-slate-300"}`} key={vehicle.id} onClick={() => setVehicleId(vehicle.id)} type="button" aria-pressed={vehicleId === vehicle.id}><div><p className="font-medium text-slate-900">{vehicle.make} {vehicle.model}</p><p className="mt-1 text-xs text-slate-500">{vehicle.modelYear ?? "Ano não informado"}{vehicle.plate ? ` · ${vehicle.plate}` : ""}</p></div><CarFront className="h-5 w-5 text-orange-700" /></button>)}</div> : <p className="py-8 text-center text-sm text-slate-500">{customerId ? "Nenhum veículo cadastrado para este cliente." : "Aguardando seleção de cliente."}</p>}</>}</CardContent>
        </Card>
      </div>

      {vehicleId || customerId ? <section className="grid gap-5 lg:grid-cols-2">{vehicleId ? <Card className="border-slate-200 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><History className="h-5 w-5 text-orange-700" />Histórico do veículo</CardTitle><CardDescription>Registros de execução deste veículo nesta oficina.</CardDescription></CardHeader><CardContent>{vehicleHistory.isLoading ? <Skeleton className="h-24" /> : vehicleHistory.isError ? <p className="text-sm text-red-700" role="alert">Não foi possível carregar o histórico deste veículo.</p> : vehicleHistory.data?.length ? <HistoryRows orders={vehicleHistory.data} /> : <p className="py-8 text-sm text-slate-500">Este veículo ainda não possui ordens de serviço registradas.</p>}</CardContent></Card> : null}{customerId ? <Card className="border-slate-200 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><ClipboardList className="h-5 w-5 text-orange-700" />Histórico operacional do cliente</CardTitle><CardDescription>Ordens de serviço e entregas de todos os veículos deste cliente nesta oficina.</CardDescription></CardHeader><CardContent>{customerHistory.isLoading ? <Skeleton className="h-24" /> : customerHistory.isError ? <p className="text-sm text-red-700" role="alert">Não foi possível carregar o histórico do cliente.</p> : customerHistory.data?.length ? <HistoryRows orders={customerHistory.data} showVehicle /> : <p className="py-8 text-sm text-slate-500">Este cliente ainda não possui ordens de serviço registradas.</p>}</CardContent></Card> : null}</section> : null}
    </main>
  </DashboardLayout>;
}
