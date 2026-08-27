import DashboardLayout, { type DashboardMenuItem } from "@/components/DashboardLayout";
import { SafeLink as Link } from "@/components/SafeLink";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Wrench } from "lucide-react";
import { useRoute } from "wouter";

const menu: DashboardMenuItem[] = [
  { icon: ArrowLeft, label: "Agenda & pátio", path: "/operacao" },
  { icon: Wrench, label: "Ordem de serviço", path: "/os" },
];

export default function WorkOrderNotes() {
  const [, params] = useRoute("/os/:id/anotacoes");
  const workOrderId = Number(params?.id ?? 0);
  const returnPath = Number.isSafeInteger(workOrderId) && workOrderId > 0 ? `/os/${workOrderId}` : "/operacao";

  return <DashboardLayout menuItems={menu} workspaceName="OficinaOS">
    <main className="mx-auto max-w-lg">
      <Card className="border-slate-200 shadow-none">
        <CardHeader>
          <CardTitle>Apontamentos indisponíveis</CardTitle>
          <CardDescription>Esta funcionalidade ainda não possui um fluxo privado versionado no Supabase. Para preservar a segurança e o isolamento por oficina, nenhum apontamento é exibido ou gravado nesta rota.</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href={returnPath}><a><Button variant="outline">Voltar para a ordem de serviço</Button></a></Link>
        </CardContent>
      </Card>
    </main>
  </DashboardLayout>;
}
