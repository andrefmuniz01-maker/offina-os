import { AlertTriangle, RotateCcw } from "lucide-react";
import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return <main className="flex min-h-screen items-center justify-center bg-background p-5" aria-live="assertive">
        <section className="w-full max-w-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="application-error-title">
          <AlertTriangle className="h-5 w-5 text-orange-700" aria-hidden="true" />
          <p className="mt-5 text-xs font-semibold text-slate-500">Falha temporária</p>
          <h1 id="application-error-title" className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Não foi possível exibir esta tela.</h1>
          <p className="mt-3 max-w-md text-sm leading-6 text-slate-600">Atualize a página para tentar novamente. Nenhuma ação foi confirmada enquanto esta tela estava indisponível.</p>
          <button onClick={() => window.location.reload()} className="mt-6 inline-flex items-center rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />Tentar novamente
          </button>
        </section>
      </main>;
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
