import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import PublicQuote from "./pages/PublicQuote";
import PublicQuoteRequest from "./pages/PublicQuoteRequest";
import Requests from "./pages/Requests";
import Quotes from "./pages/Quotes";
import Operations from "./pages/Operations";
import Inventory from "./pages/Inventory";
import Settings from "./pages/Settings";
import Platform from "./pages/Platform";
import Catalog from "./pages/Catalog";
import Purchases from "./pages/Purchases";
import WorkOrder from "./pages/WorkOrder";
import Finance from "./pages/Finance";
import Clients from "./pages/Clients";
import WorkOrderNotes from "./pages/WorkOrderNotes";
import Notifications from "./pages/Notifications";
import Team from "./pages/Team";
import Audit from "./pages/Audit";
import Reports from "./pages/Reports";

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/solicitar/:slug"} component={PublicQuoteRequest} />
      <Route path={"/solicitacoes"} component={Requests} />
      <Route path={"/orcamentos"} component={Quotes} />
      <Route path={"/operacao"} component={Operations} />
      <Route path={"/estoque"} component={Inventory} />
      <Route path={"/configuracoes"} component={Settings} />
      <Route path={"/plataforma"} component={Platform} />
      <Route path={"/cadastros"} component={Catalog} />
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
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        // switchable
      >
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
