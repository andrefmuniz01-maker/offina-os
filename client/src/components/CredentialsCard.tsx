import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Copy, Mail, MessageCircle } from "lucide-react";
import { toast } from "sonner";

export type IssuedCredentials = { email: string; temporaryPassword: string };

export function buildCredentialsMessage(credentials: IssuedCredentials, loginUrl: string) {
  return [
    "Olá! Seu acesso ao OficinaOS foi criado.",
    `Endereço: ${loginUrl}`,
    `E-mail: ${credentials.email}`,
    `Senha temporária: ${credentials.temporaryPassword}`,
    "Entre com esses dados e guarde sua senha em local seguro.",
  ].join("\n");
}

function copy(value: string, successMessage: string) {
  navigator.clipboard?.writeText(value).then(() => toast.success(successMessage)).catch(() => toast.error("Não foi possível copiar."));
}

/**
 * Mostra, uma única vez, o acesso recém-criado para quem concedeu repassar à pessoa
 * (e-mail, WhatsApp ou copiando). A senha não é guardada em lugar nenhum depois de fechar este cartão.
 */
export function CredentialsCard({ credentials, onClose, title = "Acesso criado" }: { credentials: IssuedCredentials; onClose: () => void; title?: string }) {
  const loginUrl = window.location.origin;
  const message = buildCredentialsMessage(credentials, loginUrl);
  const mailto = `mailto:${encodeURIComponent(credentials.email)}?subject=${encodeURIComponent("Seu acesso ao OficinaOS")}&body=${encodeURIComponent(message)}`;
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(message)}`;

  return <Card className="border-emerald-300 bg-emerald-50/50 shadow-sm">
    <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
      <div><CardTitle className="text-lg">{title}</CardTitle><CardDescription>Esta senha aparece só agora. Envie à pessoa antes de fechar — depois não é possível ver de novo (dá para gerar outra).</CardDescription></div>
      <Button size="sm" variant="ghost" onClick={onClose}>Fechar</Button>
    </CardHeader>
    <CardContent className="space-y-4">
      <dl className="grid gap-3 rounded-xl border border-emerald-200 bg-white p-4 text-sm sm:grid-cols-[auto_1fr_auto] sm:items-center">
        <dt className="font-medium text-slate-500">E-mail</dt><dd className="break-all font-mono text-slate-900">{credentials.email}</dd>
        <Button size="sm" variant="outline" onClick={() => copy(credentials.email, "E-mail copiado.")}><Copy className="mr-1.5 h-3.5 w-3.5" />Copiar</Button>
        <dt className="font-medium text-slate-500">Senha temporária</dt><dd className="select-all font-mono text-base font-semibold text-slate-950">{credentials.temporaryPassword}</dd>
        <Button size="sm" variant="outline" onClick={() => copy(credentials.temporaryPassword, "Senha copiada.")}><Copy className="mr-1.5 h-3.5 w-3.5" />Copiar</Button>
      </dl>
      <div className="flex flex-wrap gap-2">
        <Button asChild><a href={mailto}><Mail className="mr-2 h-4 w-4" />Enviar por e-mail</a></Button>
        <Button asChild variant="outline"><a href={whatsapp} target="_blank" rel="noreferrer"><MessageCircle className="mr-2 h-4 w-4" />Enviar por WhatsApp</a></Button>
        <Button variant="outline" onClick={() => copy(message, "Mensagem completa copiada.")}><Copy className="mr-2 h-4 w-4" />Copiar mensagem completa</Button>
      </div>
    </CardContent>
  </Card>;
}
