import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { supabase } from "@/lib/supabase";
import { useIsMobile } from "@/hooks/useMobile";
import { getSidebarResizeWidth } from "@/lib/sidebarAccessibility";
import { isDemoWorkspace, withDemoContext } from "@/lib/demoWorkspace";
import { getPasswordAuthErrorMessage, getPasswordSetupMessage } from "@/lib/passwordAuthMessages";
import { getAuthConnectionTimeoutMessage, withAuthTimeout } from "@/lib/authTimeout";
import { LayoutDashboard, LogOut, PanelLeft, Wrench } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { CSSProperties, FormEvent, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';
import { Button } from "./ui/button";

const defaultMenuItems = [
  { icon: LayoutDashboard, label: "Visão geral", path: "/" },
];

export type DashboardMenuItem = {
  icon: LucideIcon;
  label: string;
  path: string;
  disabled?: boolean;
};

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;

function PasswordAccess() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "signing-in" | "resetting" | "reset-sent" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const signInWithPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("signing-in");
    setErrorMessage(null);
    try {
      const { error } = await withAuthTimeout(() => supabase.auth.signInWithPassword({ email, password }));
      if (error) {
        setErrorMessage(getPasswordAuthErrorMessage(error));
        setStatus("error");
        return;
      }

      window.location.assign("/auth/callback");
    } catch {
      setErrorMessage(getAuthConnectionTimeoutMessage());
      setStatus("error");
    }
  };

  const requestPasswordSetup = async () => {
    if (!email) {
      setErrorMessage("Informe seu e-mail para criar ou redefinir a senha.");
      setStatus("error");
      return;
    }

    setStatus("resetting");
    setErrorMessage(null);
    const redirectTo = new URL("/auth/callback", window.location.origin).toString();
    try {
      const { error } = await withAuthTimeout(() => supabase.auth.resetPasswordForEmail(email, { redirectTo }));
      if (error) {
        setErrorMessage(getPasswordAuthErrorMessage(error));
        setStatus("error");
        return;
      }

      setStatus("reset-sent");
    } catch {
      setErrorMessage(getAuthConnectionTimeoutMessage());
      setStatus("error");
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen">
      <form onSubmit={signInWithPassword} className="flex flex-col items-center gap-5 p-8 max-w-md w-full">
        <div className="flex flex-col items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-center">Acesse sua oficina</h1>
          <p className="text-sm text-muted-foreground text-center max-w-sm">Entre com seu e-mail e senha. No primeiro acesso, crie sua senha de forma segura.</p>
        </div>
        <input
          aria-label="E-mail de acesso"
          className="h-11 w-full rounded-md border bg-background px-3 text-sm"
          type="email"
          value={email}
          onChange={event => setEmail(event.target.value)}
          required
          autoComplete="email"
          placeholder="voce@empresa.com"
        />
        <input
          aria-label="Senha"
          className="h-11 w-full rounded-md border bg-background px-3 text-sm"
          type="password"
          value={password}
          onChange={event => setPassword(event.target.value)}
          required
          minLength={10}
          autoComplete="current-password"
          placeholder="Sua senha"
        />
        <Button type="submit" disabled={status === "signing-in" || status === "resetting"} size="lg" className="w-full shadow-lg hover:shadow-xl transition-all">
          {status === "signing-in" ? "Entrando…" : "Entrar no painel"}
        </Button>
        <button
          type="button"
          onClick={requestPasswordSetup}
          disabled={status === "signing-in" || status === "resetting"}
          className="text-sm font-medium text-primary underline-offset-4 hover:underline disabled:opacity-60"
        >
          {status === "resetting" ? "Preparando redefinição…" : "Primeiro acesso ou esqueceu a senha?"}
        </button>
        {status === "reset-sent" && <p className="text-center text-sm text-muted-foreground">{getPasswordSetupMessage()}</p>}
        {status === "error" && <p className="text-center text-sm text-destructive">{errorMessage}</p>}
      </form>
    </div>
  );
}

export default function DashboardLayout({
  children,
  menuItems = defaultMenuItems,
  workspaceName = "OficinaOS",
}: {
  children: React.ReactNode;
  menuItems?: DashboardMenuItem[];
  workspaceName?: string;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) {
    return <DashboardLayoutSkeleton />
  }

  if (!user) {
    return (
      <PasswordAccess />
    );
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
        } as CSSProperties
      }
    >
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-slate-950 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white">Pular para o conteúdo principal</a>
      <DashboardLayoutContent sidebarWidth={sidebarWidth} setSidebarWidth={setSidebarWidth} menuItems={menuItems} workspaceName={workspaceName}>{children}</DashboardLayoutContent>
    </SidebarProvider>
  );
}

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  sidebarWidth: number;
  setSidebarWidth: React.Dispatch<React.SetStateAction<number>>;
  menuItems: DashboardMenuItem[];
  workspaceName: string;
};

function DashboardLayoutContent({
  children,
  sidebarWidth,
  setSidebarWidth,
  menuItems,
  workspaceName,
}: DashboardLayoutContentProps) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const currentPath = location.split("?")[0];
  const demoMode = isDemoWorkspace();
  const activeMenuItem = menuItems.find(item => item.path === currentPath);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (isCollapsed) {
      setIsResizing(false);
    }
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar
          collapsible="icon"
          className="border-r-0"
          disableTransition={isResizing}
        >
          <SidebarHeader className="h-16 justify-center">
            <div className="flex items-center gap-3 px-2 transition-all w-full">
              <button
                onClick={toggleSidebar}
                className="h-8 w-8 flex items-center justify-center hover:bg-accent rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
                aria-label="Alternar navegação"
              >
                <PanelLeft className="h-4 w-4 text-muted-foreground" />
              </button>
              <div className="workshop-brand-mark grid h-9 w-9 shrink-0 place-items-center rounded-xl" aria-hidden="true">
                <Wrench className="h-4 w-4" />
              </div>
              {!isCollapsed ? (
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-semibold tracking-tight">
                    {workspaceName}
                  </span>
                </div>
              ) : null}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0">
            <nav aria-label="Navegação principal"><SidebarMenu className="px-2 py-1">
              {menuItems.map(item => {
                const isActive = currentPath === item.path;
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => !item.disabled && setLocation(demoMode ? withDemoContext(item.path) : item.path)}
                      tooltip={item.label}
                      disabled={item.disabled}
                      className={`h-10 rounded-lg font-normal transition-all duration-150 active:scale-[0.99] data-[active=true]:font-semibold ${item.disabled ? "opacity-45" : ""}`}
                    >
                      <item.icon
                        className={`h-4 w-4 ${isActive ? "text-primary" : ""}`}
                      />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu></nav>
          </SidebarContent>

          <SidebarFooter className="p-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-accent/50 transition-colors w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar className="h-9 w-9 border shrink-0">
                    <AvatarFallback className="text-xs font-medium">
                      {user?.name?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <p className="text-sm font-medium truncate leading-none">
                      {user?.name || "-"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-1.5">
                      {user?.email || "-"}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sair</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
        <button
          type="button"
          aria-label="Redimensionar navegação lateral"
          title="Use as setas esquerda e direita para redimensionar"
          className={`absolute top-0 right-0 h-full w-2 cursor-col-resize border-0 bg-transparent hover:bg-primary/20 focus-visible:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => {
            if (isCollapsed) return;
            setIsResizing(true);
          }}
          onKeyDown={event => {
            const nextWidth = getSidebarResizeWidth(sidebarWidth, event.key, MIN_WIDTH, MAX_WIDTH);
            if (nextWidth !== sidebarWidth) { event.preventDefault(); setSidebarWidth(nextWidth); }
          }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset>
        {isMobile && (
          <div className="flex border-b h-14 items-center justify-between bg-background/95 px-2 backdrop-blur supports-[backdrop-filter]:backdrop-blur sticky top-0 z-40">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-9 w-9 rounded-lg bg-background" />
              <div className="flex items-center gap-3">
                <div className="flex flex-col gap-1">
                  <span className="tracking-tight text-foreground">
                    {activeMenuItem?.label ?? "Menu"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
        <main id="main-content" tabIndex={-1} className="flex-1 p-4 focus:outline-none">{children}</main>
      </SidebarInset>
    </>
  );
}
