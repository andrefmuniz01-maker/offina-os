import { SafeLink as Link } from "@/components/SafeLink";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buildSchedulingMessage } from "@/lib/scheduling";
import { buildWhatsappLink } from "@/lib/whatsappLink";
import { trpc } from "@/lib/trpc";
import { CalendarClock, Link2, MessageCircle } from "lucide-react";
import { toast } from "sonner";

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function approvedAgo(approvedAt: string | null) {
  if (!approvedAt) return null;
  const hours = Math.max(0, Math.floor((Date.now() - new Date(approvedAt).getTime()) / 3_600_000));
  if (hours < 1) return "aprovada agora há pouco";
  if (hours < 24) return `aprovada há ${hours} h`;
  const days = Math.floor(hours / 24);
  return `aprovada há ${days} ${days === 1 ? "dia" : "dias"}`;
}

/**
 * Fila de trabalho da Agenda: propostas que o cliente já aprovou e ainda não têm horário.
 * Cada linha envia o link de agendamento por WhatsApp (o cliente escolhe o horário) ou copia o link.
 */
export function AwaitingScheduling({ tenantId }: { tenantId: number }) {
  const awaiting = trpc.workspaceOperations.awaitingScheduling.useQuery({ tenantId }, { enabled: Boolean(tenantId) });
  const items = awaiting.data ?? [];
  if (awaiting.isLoading || awaiting.isError || !items.length) return null;

  return <Card className="border-amber-200 bg-amber-50/40 shadow-none">
    <CardHeader className="pb-3">
      <div className="flex items-center gap-2"><CalendarClock className="h-5 w-5 text-amber-700" aria-hidden="true" /><CardTitle className="text-lg">Aguardando horário</CardTitle><Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">{items.length}</Badge></div>
      <CardDescription>Propostas já aprovadas pelo cliente. Envie o link para ele escolher o dia e o horário; o agendamento e a OS são criados sozinhos.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-2">
      {items.map(item => {
        const url = new URL(`/agendar/${item.publicToken}`, window.location.origin).toString();
        const whatsapp = buildWhatsappLink(item.customerWhatsapp, buildSchedulingMessage({ customerName: item.customerName, vehicleName: item.vehicleName, workshopName: item.workshopName, quoteNumber: item.quoteNumber, link: url }));
        const ago = approvedAgo(item.approvedAt);
        return <div key={item.quoteId} className="flex flex-col gap-3 rounded-xl border border-amber-100 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="font-medium text-slate-950">{item.customerName} <span className="font-normal text-slate-500">· {item.vehicleName}</span></p>
            <p className="mt-0.5 text-xs text-slate-500">Proposta #{String(item.quoteNumber).padStart(6, "0")} · {currency.format(item.total)}{ago ? ` · ${ago}` : ""}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm"><a href={whatsapp} target="_blank" rel="noreferrer"><MessageCircle className="mr-1.5 h-4 w-4" />Enviar link</a></Button>
            <Button size="sm" variant="outline" onClick={() => navigator.clipboard?.writeText(url).then(() => toast.success("Link de agendamento copiado.")).catch(() => toast.error("Não foi possível copiar."))}><Link2 className="mr-1.5 h-4 w-4" />Copiar link</Button>
            <Button asChild size="sm" variant="ghost"><Link href="/orcamentos"><a>Abrir proposta</a></Link></Button>
          </div>
        </div>;
      })}
    </CardContent>
  </Card>;
}
