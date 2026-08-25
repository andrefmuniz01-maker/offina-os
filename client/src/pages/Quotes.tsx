import DashboardLayout, { type DashboardMenuItem } from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Copy, FileText, Send } from "lucide-react";
import { SafeLink as Link } from "@/components/SafeLink";
import { toast } from "sonner";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const menu: DashboardMenuItem[] = [{ icon: ArrowLeft, label: "Visão geral", path: "/" }, { icon: FileText, label: "Orçamentos", path: "/orcamentos" }];
const labels: Record<string, string> = { draft: "Rascunho", ready: "Pronto", sent: "Enviado", viewed: "Visualizado", approved: "Aprovado", rejected: "Recusado", expired: "Expirado", cancelled: "Cancelado" };

export default function Quotes() {
  const mine = trpc.tenant.mine.useQuery();
  const tenant = mine.data?.[0]?.tenant;
  const list = trpc.quotes.list.useQuery({ tenantId: tenant?.id ?? 0 }, { enabled: Boolean(tenant?.id) });
  const utils = trpc.useUtils();
  const send = trpc.quotes.send.useMutation({ onSuccess: async result => { await navigator.clipboard.writeText(result.preparedMessage); toast.success("Mensagem preparada e copiada. Revise antes de enviar no WhatsApp."); utils.quotes.list.invalidate(); }, onError: error => toast.error(error.message) });
  return <DashboardLayout menuItems={menu} workspaceName={tenant?.name ?? "OficinaOS"}><main className="mx-auto max-w-6xl space-y-7"><header className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end"><div><Link href="/"><a className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900"><ArrowLeft className="h-3.5 w-3.5" />Visão geral</a></Link><h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Orçamentos</h1><p className="mt-1 text-sm text-slate-500">Revise valores calculados e prepare a mensagem para o cliente.</p></div><Badge className="w-fit bg-orange-100 text-orange-800 hover:bg-orange-100">Sem disparos automáticos</Badge></header>{list.isLoading ? <div className="space-y-3">{Array.from({ length: 4 }).map((_, index) => <Skeleton className="h-24" key={index} />)}</div> : list.data?.length ? <div className="space-y-3">{list.data.map(({ quote, customer, vehicle }) => <Card key={quote.id} className="border-slate-200"><CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between"><div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-slate-950">Orçamento #{String(quote.number).padStart(6, "0")}</p><Badge variant="outline">{labels[quote.status] ?? quote.status}</Badge></div><p className="mt-1 text-sm text-slate-600">{customer.name} · {vehicle.make} {vehicle.model} · <strong>{money.format(Number(quote.total))}</strong></p><p className="mt-1 text-xs text-slate-500">Válido até {new Date(quote.validUntil).toLocaleDateString("pt-BR")}</p></div><Button disabled={send.isPending || ["approved", "rejected", "expired", "cancelled"].includes(quote.status)} onClick={() => send.mutate({ tenantId: tenant!.id, quoteId: quote.id })}><Send className="mr-2 h-4 w-4" />{send.isPending ? "Preparando…" : "Preparar envio"}</Button></CardContent></Card>)}</div> : <Card className="border-dashed border-slate-300"><CardHeader className="items-center py-16 text-center"><div className="grid h-12 w-12 place-items-center rounded-xl bg-orange-50 text-orange-700"><FileText className="h-6 w-6" /></div><CardTitle className="mt-4">Nenhum orçamento criado</CardTitle><CardDescription className="max-w-md">Gere um orçamento a partir de uma solicitação com serviço vinculado. Os valores serão calculados com base no catálogo e no estoque da oficina.</CardDescription></CardHeader></Card>}<p className="flex items-center gap-2 text-xs text-slate-500"><Copy className="h-3.5 w-3.5" />Ao preparar o envio, o texto é apenas copiado para revisão no WhatsApp; o sistema não dispara mensagens.</p></main></DashboardLayout>;
}
