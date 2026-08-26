import {
  AlertTriangle,
  ArrowRight,
  Box,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  Gauge,
  LoaderCircle,
  LockKeyhole,
  ReceiptText,
  ShieldCheck,
  UserRound,
  Wrench,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  canAccessDemoModule,
  demoModules,
  demoRoles,
  getDemoStateCopy,
  type DemoModule,
  type DemoRole,
  type DemoState,
} from "@/lib/demoWorkspace";
import { getStagingValidationStep } from "@/lib/stagingValidation";
import { trpc } from "@/lib/trpc";

const moduleIcons = {
  dashboard: Gauge,
  requests: ClipboardList,
  quotes: ReceiptText,
  schedule: CalendarDays,
  inventory: Box,
  workOrder: Wrench,
} as const;

const stateOptions: Array<{ id: DemoState; label: string }> = [
  { id: "ready", label: "Dados" },
  { id: "loading", label: "Carregando" },
  { id: "empty", label: "Sem dados" },
  { id: "error", label: "Erro" },
];

const flow = [
  { entity: "quote_request", label: "Solicitação", description: "Entrada comercial" },
  { entity: "quote", label: "Orçamento", description: "Proposta e decisão" },
  { entity: "inventory_reservation", label: "Reserva", description: "Estoque protegido" },
  { entity: "appointment", label: "Agenda", description: "Capacidade definida" },
  { entity: "work_order", label: "OS", description: "Execução técnica" },
  { entity: "work_order_consumption", label: "Consumo", description: "Baixa real" },
  { entity: "revenue", label: "Financeiro", description: "Receita prevista" },
];

function StateGlyph({ state }: { state: DemoState }) {
  if (state === "loading") return <LoaderCircle className="size-5 animate-spin text-amber-500" aria-hidden="true" />;
  if (state === "empty") return <CircleAlert className="size-5 text-slate-500" aria-hidden="true" />;
  if (state === "error") return <XCircle className="size-5 text-rose-600" aria-hidden="true" />;
  return <CheckCircle2 className="size-5 text-emerald-600" aria-hidden="true" />;
}

export default function DemoWorkspace() {
  const [role, setRole] = useState<DemoRole>("owner");
  const [activeModule, setActiveModule] = useState<DemoModule>("dashboard");
  const [state, setState] = useState<DemoState>("ready");
  const { isAuthenticated } = useAuth();
  const tenantQuery = trpc.tenant.mine.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const active = useMemo(
    () => demoModules.find(module => module.id === activeModule) ?? demoModules[0],
    [activeModule],
  );
  const canAccess = canAccessDemoModule(role, active.id);
  const stateCopy = getDemoStateCopy(state);
  const stagingStep = getStagingValidationStep(role);
  const ActiveIcon = moduleIcons[active.id];
  const activeTenant = tenantQuery.data?.[0]?.tenant;

  return (
    <div className="min-h-screen bg-[#f5f5f1] text-slate-950 selection:bg-amber-200">
      <a href="#demo-main" className="sr-only focus:not-sr-only focus:absolute focus:left-6 focus:top-5 focus:z-50 focus:rounded-md focus:bg-slate-950 focus:px-4 focus:py-2 focus:text-white">Ir para o conteúdo</a>
      <div className="border-b border-slate-200 bg-white/90 px-5 py-3 backdrop-blur lg:px-8">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-slate-950 text-sm font-extrabold tracking-tight text-amber-300 shadow-sm">O</div>
            <div className="min-w-0">
              <p className="font-semibold tracking-tight text-slate-950">OficinaOS</p>
              <p className="truncate text-xs text-slate-500">Prévia navegável do produto</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800">
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            {activeTenant ? "Contexto real validado" : "Demonstração protegida"}
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-[1500px] lg:grid-cols-[275px_minmax(0,1fr)]">
        <aside className="border-b border-slate-200 bg-white px-5 py-6 lg:min-h-[calc(100vh-65px)] lg:border-b-0 lg:border-r lg:px-6">
          <div className="mb-7 rounded-2xl border border-slate-200 bg-[#fafaf7] p-4 shadow-[0_1px_0_rgba(15,23,42,0.03)]">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Contexto atual</p>
            <div className="flex items-start gap-3">
              <div className="grid size-9 place-items-center rounded-lg bg-amber-100 text-amber-900"><Wrench className="size-4" aria-hidden="true" /></div>
              <div>
                <p className="text-sm font-semibold text-slate-950">{activeTenant?.name ?? "Oficina ativa"}</p>
                <p className="mt-0.5 text-xs leading-5 text-slate-600">{activeTenant ? `Contexto real: tenantId ${activeTenant.id}.` : "O tenant é aplicado pela API antes de qualquer consulta."}</p>
              </div>
            </div>
          </div>

          <nav aria-label="Módulos da demonstração" className="space-y-1">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Fluxos da plataforma</p>
            {demoModules.map(module => {
              const Icon = moduleIcons[module.id];
              const selected = activeModule === module.id;
              const available = canAccessDemoModule(role, module.id);
              return (
                <button
                  key={module.id}
                  type="button"
                  onClick={() => setActiveModule(module.id)}
                  aria-current={selected ? "page" : undefined}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${selected ? "bg-slate-950 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"}`}
                >
                  <span className="flex items-center gap-3"><Icon className="size-4" aria-hidden="true" />{module.label}</span>
                  {!available && <LockKeyhole className={`size-3.5 ${selected ? "text-amber-300" : "text-slate-400"}`} aria-label="Acesso restrito" />}
                </button>
              );
            })}
          </nav>

          <div className="mt-8 border-t border-slate-200 pt-6">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Perfil demonstrado</p>
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1" role="group" aria-label="Selecionar papel de usuário">
              {(Object.keys(demoRoles) as DemoRole[]).map(option => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={role === option}
                  onClick={() => setRole(option)}
                  className={`rounded-lg px-2 py-2 text-xs font-semibold transition ${role === option ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-950"}`}
                >
                  {demoRoles[option].label}
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-600">{demoRoles[role].summary}</p>
          </div>
        </aside>

        <main id="demo-main" className="min-w-0 px-5 py-7 sm:px-8 lg:px-10 lg:py-10">
          <div className="mb-8 flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
            <div>
              <div className="mb-3 flex items-center gap-2 text-xs font-medium text-slate-500">
                Ambiente de demonstração <ChevronRight className="size-3.5" aria-hidden="true" /> {active.label}
              </div>
              <h1 className="max-w-3xl text-3xl font-bold tracking-[-0.045em] text-slate-950 sm:text-4xl">A operação toda conversa. <span className="text-amber-700">Nada é isolado.</span></h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">Uma superfície de revisão para visualizar como o OficinaOS conecta atendimento, orçamento, estoque e execução sem expor dados de uma oficina a outra.</p>
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Alternar estado da interface">
              {stateOptions.map(option => (
                <button
                  type="button"
                  key={option.id}
                  aria-pressed={state === option.id}
                  onClick={() => setState(option.id)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${state === option.id ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-400 hover:text-slate-950"}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <section aria-label="Estado atual do módulo" className="relative overflow-hidden rounded-3xl border border-slate-200 bg-slate-950 p-6 text-white shadow-[0_18px_50px_rgba(15,23,42,0.12)] sm:p-8">
            <div className="pointer-events-none absolute inset-0 opacity-30" style={{ backgroundImage: "radial-gradient(circle at 85% 15%, rgba(245,158,11,.55), transparent 26%), linear-gradient(135deg, transparent 20%, rgba(255,255,255,.06) 20.2%, transparent 20.5%)", backgroundSize: "auto, 24px 24px" }} />
            <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl">
                <div className="mb-5 flex items-center gap-3">
                  <div className="grid size-11 place-items-center rounded-xl bg-white/10 text-amber-300 ring-1 ring-white/10"><ActiveIcon className="size-5" aria-hidden="true" /></div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-amber-200">Entidade: {active.entity}</p>
                    <p className="mt-1 text-sm text-slate-300">Papel ativo: {demoRoles[role].label}</p>
                  </div>
                </div>
                <h2 className="text-2xl font-bold tracking-[-0.035em]">{active.label}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-300">{active.summary}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.07] p-4 lg:max-w-xs">
                <p className="text-[11px] font-bold uppercase tracking-[0.13em] text-amber-200">Próxima ação</p>
                <p className="mt-2 text-sm font-medium leading-5 text-white">{canAccess ? active.nextAction : "Solicite acesso a um administrador para continuar neste módulo."}</p>
              </div>
            </div>
          </section>

          {!canAccess ? (
            <section aria-label="Acesso restrito" className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
              <div className="flex items-start gap-3"><LockKeyhole className="mt-0.5 size-5 shrink-0" aria-hidden="true" /><div><h2 className="font-semibold">Acesso intencionalmente bloqueado</h2><p className="mt-1 text-sm leading-6 text-amber-900">O papel de {demoRoles[role].label.toLowerCase()} não recebe este módulo. O bloqueio deve existir no servidor, não apenas nesta camada visual.</p></div></div>
            </section>
          ) : (
            <section aria-label="Conteúdo do módulo" className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_1px_0_rgba(15,23,42,0.03)]">
                <div className="flex items-start justify-between gap-5">
                  <div className="flex items-start gap-3"><div className="mt-0.5 rounded-lg bg-slate-100 p-2"><StateGlyph state={state} /></div><div><h2 className="font-semibold text-slate-950">{stateCopy.title}</h2><p className="mt-1 max-w-xl text-sm leading-6 text-slate-600">{stateCopy.detail}</p></div></div>
                  <span className="hidden rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-600 sm:inline">{state}</span>
                </div>
                <div className="mt-7 grid gap-3 sm:grid-cols-3">
                  {["Tenant validado", "Permissão verificada", "Auditoria preparada"].map((signal, index) => (
                    <div key={signal} className="rounded-xl border border-slate-200 bg-[#fafaf7] p-4"><p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Controle {String(index + 1).padStart(2, "0")}</p><p className="mt-2 text-sm font-semibold text-slate-800">{signal}</p></div>
                  ))}
                </div>
                <div className="mt-6 flex items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600"><AlertTriangle className="size-4 shrink-0 text-amber-600" aria-hidden="true" />Nenhuma informação operacional é criada neste modo. Os registros reais são consultados somente no ambiente de staging.</div>
              </div>
              <aside aria-label="Controle de acesso" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_1px_0_rgba(15,23,42,0.03)]">
                <div className="flex items-center gap-2 text-slate-950"><UserRound className="size-4" aria-hidden="true" /><h2 className="font-semibold">Visibilidade por papel</h2></div>
                <p className="mt-2 text-sm leading-6 text-slate-600">A prévia expõe a intenção da regra antes de receber registros reais.</p>
                <div className="mt-5 space-y-3">
                  <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-semibold text-slate-950">Dono</p><p className="mt-1 text-xs leading-5 text-slate-600">Indicadores, decisões e visão completa da oficina.</p></div>
                  <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-semibold text-slate-950">Atendente</p><p className="mt-1 text-xs leading-5 text-slate-600">Comercial, agenda e operação sem custos internos.</p></div>
                  <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-semibold text-slate-950">Técnico</p><p className="mt-1 text-xs leading-5 text-slate-600">Execução atribuída, checklist e consumo da OS.</p></div>
                </div>
              </aside>
            </section>
          )}

          <section id="fluxo" aria-label="Fluxo operacional integrado" className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_1px_0_rgba(15,23,42,0.03)] sm:p-7">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-700">Cadeia principal</p><h2 className="mt-1 text-xl font-bold tracking-[-0.025em] text-slate-950">Do primeiro contato à receita prevista</h2></div><p className="max-w-sm text-sm leading-5 text-slate-600">A mesma cadeia define a ordem de leitura e as dependências no staging.</p></div>
            <ol className="mt-7 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {flow.map((step, index) => (
                <li key={step.entity} className="group relative rounded-xl border border-slate-200 bg-[#fafaf7] p-4 transition hover:-translate-y-0.5 hover:border-amber-300 hover:bg-amber-50/40">
                  <div className="flex items-start justify-between gap-3"><span className="text-xs font-bold text-amber-700">{String(index + 1).padStart(2, "0")}</span>{index < flow.length - 1 && <ArrowRight className="size-4 text-slate-300 group-hover:text-amber-600" aria-hidden="true" />}</div>
                  <p className="mt-5 text-sm font-semibold text-slate-950">{step.label}</p><p className="mt-1 text-xs text-slate-600">{step.description}</p><code className="mt-3 block truncate text-[10px] text-slate-400">{step.entity}</code>
                </li>
              ))}
            </ol>
          </section>

          <section id="validacao" aria-label="Próxima etapa de validação" className="mt-8 flex flex-col gap-5 rounded-2xl border border-slate-200 bg-[#e9e6de] p-6 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Próxima etapa</p><h2 className="mt-1 text-lg font-bold tracking-[-0.025em] text-slate-950">Validar com ambiente de staging, sessões reais e alertas internos.</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">O endpoint protegido de varredura operacional está preparado para identificar estoque crítico e follow-up sugerido. Ele apenas cria notificações internas idempotentes; nenhum contato externo é disparado automaticamente.</p></div>
            <a href="#fluxo" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800">Revisar cadeia <ArrowRight className="size-4" aria-hidden="true" /></a>
          </section>

          <section aria-label="Matriz de validação em staging" className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_1px_0_rgba(15,23,42,0.03)] sm:p-7">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-700">Matriz de staging</p><h2 className="mt-1 text-xl font-bold tracking-[-0.025em] text-slate-950">Uma sessão, um papel, uma evidência verificável.</h2></div><span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600">Perfil selecionado: {demoRoles[role].label}</span></div>
            <div className="mt-6 grid gap-4 md:grid-cols-[52px_minmax(0,1fr)_minmax(0,1.2fr)] md:items-center">
              <div className="grid size-12 place-items-center rounded-xl bg-amber-100 text-amber-800"><CheckCircle2 className="size-5" aria-hidden="true" /></div>
              <div><p className="text-sm font-semibold text-slate-950">{stagingStep.title}</p><code className="mt-2 inline-block rounded bg-slate-100 px-2 py-1 text-[11px] text-slate-600">{stagingStep.route}</code></div>
              <p className="text-sm leading-6 text-slate-600">{stagingStep.assertion}</p>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
