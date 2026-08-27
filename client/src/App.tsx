import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { lazy, Suspense } from "react";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import { operationsRoutePaths } from "./lib/operationsRoutes";

const PublicQuote = lazy(() => import("./pages/PublicQuote"));
const PublicQuoteRequest = lazy(() => import("./pages/PublicQuoteRequest"));
const Requests = lazy(() => import("./pages/Requests"));
const Quotes = lazy(() => import("./pages/Quotes"));
const Operations = lazy(() => import("./pages/Operations"));
const Inventory = lazy(() => import("./pages/Inventory"));
const Settings = lazy(() => import("./pages/Settings"));
const Platform = lazy(() => import("./pages/Platform"));
const InternalDemo = lazy(() => import("./pages/InternalDemo"));
const Catalog = lazy(() => import("./pages/Catalog"));
const Categories = lazy(() => import("./pages/Categories"));
const CatalogItems = lazy(() => import("./pages/CatalogItems"));
const Purchases = lazy(() => import("./pages/Purchases"));
const WorkOrder = lazy(() => import("./pages/WorkOrder"));
const Finance = lazy(() => import("./pages/Finance"));
const Clients = lazy(() => import("./pages/Clients"));
const WorkOrderNotes = lazy(() => import("./pages/WorkOrderNotes"));
const Notifications = lazy(() => import("./pages/Notifications"));
const Team = lazy(() => import("./pages/Team"));
const Audit = lazy(() => import("./pages/Audit"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
const Reports = lazy(() => import("./pages/Reports"));

function RouteFallback() {
  return <main className="grid min-h-screen place-items-center bg-[#f8fafc] p-5"><div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="h-2 w-16 animate-pulse rounded-full bg-orange-200" /><p className="mt-4 text-sm font-medium text-slate-800">Carregando módulo…</p><p className="mt-1 text-sm text-slate-500">Preparando as informações necessárias.</p></div></main>;
}

function Router() {
  return <Suspense fallback={<RouteFallback />}><Switch>
    <Route path={"/auth/callback"} component={AuthCallback} />
    <Route path={"/"} component={Home} />
    <Route path={"/solicitar/:slug"} component={PublicQuoteRequest} />
    <Route path={"/solicitacoes"} component={Requests} />
    <Route path={"/orcamentos"} component={Quotes} />
    {operationsRoutePaths.map(path => <Route key={path} path={path} component={Operations} />)}
    <Route path={"/estoque"} component={Inventory} />
    <Route path={"/configuracoes"} component={Settings} />
    <Route path={"/plataforma"} component={Platform} />
    <Route path={"/demo-interna"} component={InternalDemo} />
    <Route path={"/cadastros"} component={Catalog} />
    <Route path={"/cadastros/itens"} component={CatalogItems} />
    <Route path={"/categorias"} component={Categories} />
    <Route path={"/compras"} component={Purchases} />
    <Route path={"/os/:id/anotacoes"} component={WorkOrderNotes} />
    <Route path={"/os/:id"} component={WorkOrder} />
    <Route path={"/financeiro"} component={Finance} />
    <Route path={"/clientes"} component={Clients} />
    <Route path={"/notificacoes"} component={Notifications} />
    <Route path={"/equipe"} component={Team} />
    <Route path={"/auditoria"} component={Audit} />
    <Route path={"/relatorios"} component={Reports} />
    <Route path={"/orcamento/:token"} component={PublicQuote} />
    <Route path={"/404"} component={NotFound} />
    <Route component={NotFound} />
  </Switch></Suspense>;
}

function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster /><Router /></TooltipProvider></ThemeProvider></ErrorBoundary>;
}

export default App;
