import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  Activity, Bell, Database, KeyRound, FileUp, Gauge, LogOut, Monitor, Search, Server, Settings, Terminal,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger,
} from "@/components/ui/sidebar";
import { Logo } from "./Logo";
import { useOrg } from "@/lib/org";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const groups = [
  { label: "Visão geral", items: [{ to: "/dashboard", label: "Dashboard", icon: Gauge }] },
  {
    label: "Sistemas",
    items: [
      { to: "/windows", label: "Windows", icon: Monitor },
      { to: "/linux", label: "Linux", icon: Terminal },
    ],
  },
  {
    label: "Investigação",
    items: [
      { to: "/explorer", label: "Log Explorer", icon: Search },
      { to: "/alerts", label: "Alertas", icon: Bell },
    ],
  },
  {
    label: "Gestão",
    items: [
      { to: "/servers", label: "Servidores", icon: Server },
      { to: "/collectors", label: "Agentes e Coletores", icon: Activity },
      { to: "/upload", label: "Ingestão de logs", icon: FileUp },
    ],
  },
  { label: "Administração", items: [{ to: "/api-keys", label: "Chaves de API", icon: KeyRound }, { to: "/settings", label: "Configurações", icon: Settings }] },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { data: org } = useOrg();
  const navigate = useNavigate();

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader className="px-3 py-4">
          <Link to="/dashboard">
            <Logo />
          </Link>
        </SidebarHeader>
        <SidebarContent>
          {groups.map((g) => (
            <SidebarGroup key={g.label}>
              <SidebarGroupLabel className="text-[10px] uppercase tracking-[0.16em]">{g.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {g.items.map((it) => (
                    <SidebarMenuItem key={it.to}>
                      <SidebarMenuButton asChild isActive={path.startsWith(it.to)} tooltip={it.label}>
                        <Link to={it.to}>
                          <it.icon />
                          <span>{it.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Sair"
                onClick={async () => {
                  await supabase.auth.signOut();
                  navigate({ to: "/auth" });
                }}
              >
                <LogOut />
                <span className="truncate">{org?.email ?? "Sair"}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-w-0 bg-background">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur">
          <SidebarTrigger />
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Database className="size-3.5" />
            <span className="font-medium text-foreground">{org?.orgName ?? "…"}</span>
            {org && <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase">{org.role}</span>}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
              <Activity className="size-3.5 text-success animate-pulse-dot" /> Pipeline ativo
            </span>
            <Button asChild size="sm" variant="outline">
              <Link to="/upload">
                <FileUp /> Enviar logs
              </Link>
            </Button>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
