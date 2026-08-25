import DashboardLayout, { type DashboardMenuItem } from "@/components/DashboardLayout";
import { SafeLink as Link } from "@/components/SafeLink";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, CarFront, ClipboardList, Plus, UsersRound } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const menu: DashboardMenuItem[] = [{ icon: ArrowLeft, label: "Visão geral", path: "/" }, { icon: UsersRound, label: "Clientes & veículos", path: "/clientes" }];

function HistoryRows({ orders, showVehicle = false }: { orders: Array<{ id: number; number: number; status: string; createdAt: Date; deliveredAt: Date | null; vehicleMake?: string; vehicleModel?: string; vehiclePlate?: string | null; postSaleNotificationId?: number | null; postSaleTitle?: string | null; postSaleBody?: string | null; postSaleCreatedAt?: Date | null; postSaleLink?: string | null }>; showVehicle?: boolean }) {
  return <div className="divide-y divide-slate-100">{orders.map(order => <div className="flex flex-wrap items-start justify-between gap-3 py-3" key={order.id}><div><p className="font-medium text-slate-900">OS #{String(order.number).padStart(6, "0")}{showVehicle && order.vehicleMake ? ` · ${order.vehicleMake} ${order.vehicleModel}` : ""}</p><p className="mt-1 text-xs text-slate-500">{showVehicle && order.vehiclePlate ? `${order.vehiclePlate} · ` : ""}Aberta em {new Date(order.createdAt).toLocaleDateString("pt-BR")}{order.deliveredAt ? ` · Entregue em ${new Date(order.deliveredAt).toLocaleDateString("pt-BR")}` : ""}</p>{order.postSaleTitle ? <div className="mt-3 rounded-lg border border-orange-100 bg-orange-50 px-3 py-2"><p className="text-xs font-semibold text-orange-900">{order.postSaleTitle}</p><p className="mt-1 text-xs leading-5 text-orange-800">{order.postSaleBody}</p>{order.postSaleLink ? <Link href={order.postSaleLink}><a className="mt-2 inline-flex text-xs font-semibold text-orange-800 underline underline-offset-2">Abrir OS e preparar acompanhamento</a></Link> : null}</div> : null}</div><Badge variant="outline">{order.status.replaceAll("_", " ")}</Badge></div>)}</div>;
}

export default function Clients() {
  const mine = trpc.tenant.mine.useQuery();
  const tenant = mine.data?.[0]?.tenant;
  const tenantId = tenant?.id ?? 0;
  const utils = trpc.useUtils();
  const customers = trpc.customers.list.useQuery({ tenantId, page: 1, pageSize: 100 }, { enabled: Boolean(tenantId) });
  const [customerId, setCustomerId] = useState("");
  const [vehicleId, setVehicleId] = useState<number | null>(null);
  const [form, setForm] = useState({ make: "", model: "", modelYear: "", plate: "" });
  const vehicles = trpc.vehicles.listByCustomer.useQuery({ tenantId, customerId: Number(customerId) }, { enabled: Boolean(tenantId && customerId) });
  const vehicleHistory = trpc.vehicles.workOrderHistory.useQuery({ tenantId, vehicleId: vehicleId ?? 0 }, { enabled: Boolean(tenantId && vehicleId) });
  const customerHistory = trpc.customers.workOrderHistory.useQuery({ tenantId, customerId: Number(customerId) }, { enabled: Boolean(tenantId && customerId) });
  const create = trpc.vehicles.create.useMutation({ onSuccess: () => { toast.success("Veículo cadastrado no histórico do cliente."); setForm({ make: "", model: "", modelYear: "", plate: "" }); utils.vehicles.listByCustomer.invalidate(); }, onError: error => toast.error(error.message) });

  return <DashboardLayout menuItems={menu} workspaceName={tenant?.name ?? "OficinaOS"}>
    <main className="mx-auto max-w-6xl space-y-7">
      <header className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end"><div><Link href="/"><a className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900"><ArrowLeft className="h-3.5 w-3.5" />Visão geral</a></Link><h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Clientes e veículos</h1><p className="mt-1 text-sm text-slate-500">O histórico de veículo e cliente permanece no mesmo tenant e alimenta solicitações, OS e pós-venda.</p></div><Badge className="w-fit bg-orange-100 text-orange-800 hover:bg-orange-100">Histórico protegido</Badge></header>
      <div className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
        <Card className="border-slate-200"><CardHeader><CardTitle className="text-lg">Novo veículo</CardTitle><CardDescription>Selecione o proprietário antes de cadastrar o veículo.</CardDescription></CardHeader><CardContent className="grid gap-3"><div className="grid gap-2"><Label>Cliente</Label><select className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm" value={customerId} onChange={event => { setCustomerId(event.target.value); setVehicleId(null); }}><option value="">Selecione</option>{customers.data?.map(customer => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></div><div className="grid grid-cols-2 gap-3"><div className="grid gap-2"><Label>Marca</Label><Input value={form.make} onChange={event => setForm({ ...form, make: event.target.value })} placeholder="Ex.: BMW" /></div><div className="grid gap-2"><Label>Modelo</Label><Input value={form.model} onChange={event => setForm({ ...form, model: event.target.value })} placeholder="Ex.: 320i" /></div></div><div className="grid grid-cols-2 gap-3"><div className="grid gap-2"><Label>Ano</Label><Input type="number" min="1900" max="2100" value={form.modelYear} onChange={event => setForm({ ...form, modelYear: event.target.value })} /></div><div className="grid gap-2"><Label>Placa</Label><Input value={form.plate} onChange={event => setForm({ ...form, plate: event.target.value })} placeholder="ABC1D23" /></div></div><Button disabled={create.isPending || !customerId || !form.make || !form.model} onClick={() => create.mutate({ tenantId, customerId: Number(customerId), make: form.make, model: form.model, modelYear: form.modelYear ? Number(form.modelYear) : undefined, plate: form.plate || undefined })}><Plus className="mr-2 h-4 w-4" />Cadastrar veículo</Button></CardContent></Card>
        <Card className="border-slate-200"><CardHeader><CardTitle className="text-lg">Veículos do cliente</CardTitle><CardDescription>{customerId ? "Selecione um veículo para abrir seu histórico de execução." : "Selecione um cliente para consultar seus veículos."}</CardDescription></CardHeader><CardContent>{vehicles.isLoading ? <Skeleton className="h-48" /> : vehicles.data?.length ? <div className="space-y-2">{vehicles.data.map(vehicle => <button className={`flex w-full items-center justify-between rounded-xl border p-4 text-left transition-colors ${vehicleId === vehicle.id ? "border-orange-300 bg-orange-50" : "border-slate-100 hover:border-slate-300"}`} key={vehicle.id} onClick={() => setVehicleId(vehicle.id)} type="button"><div><p className="font-medium text-slate-900">{vehicle.make} {vehicle.model}</p><p className="mt-1 text-xs text-slate-500">{vehicle.modelYear ?? "Ano não informado"}{vehicle.plate ? ` · ${vehicle.plate}` : ""}</p></div><CarFront className="h-5 w-5 text-orange-700" /></button>)}</div> : <p className="py-12 text-center text-sm text-slate-500">{customerId ? "Nenhum veículo cadastrado para este cliente." : "Aguardando seleção de cliente."}</p>}</CardContent></Card>
      </div>
      {vehicleId ? <Card className="border-slate-200"><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><ClipboardList className="h-5 w-5 text-orange-700" />Histórico de ordens de serviço</CardTitle><CardDescription>Registros de execução deste veículo nesta oficina.</CardDescription></CardHeader><CardContent>{vehicleHistory.isLoading ? <Skeleton className="h-24" /> : vehicleHistory.data?.length ? <HistoryRows orders={vehicleHistory.data} /> : <p className="py-8 text-sm text-slate-500">Este veículo ainda não possui ordens de serviço registradas.</p>}</CardContent></Card> : null}
      {customerId ? <Card className="border-slate-200"><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><ClipboardList className="h-5 w-5 text-orange-700" />Histórico operacional do cliente</CardTitle><CardDescription>Ordens de serviço e entregas de todos os veículos deste cliente nesta oficina.</CardDescription></CardHeader><CardContent>{customerHistory.isLoading ? <Skeleton className="h-24" /> : customerHistory.data?.length ? <HistoryRows orders={customerHistory.data} showVehicle /> : <p className="py-8 text-sm text-slate-500">Este cliente ainda não possui ordens de serviço registradas.</p>}</CardContent></Card> : null}
    </main>
  </DashboardLayout>;
}
