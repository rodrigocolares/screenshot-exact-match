import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Bell, BrainCircuit, FileSearch, Monitor, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/app/Logo";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "LogSentinel AI — Monitoramento inteligente de logs Windows e Linux" },
      { name: "description", content: "Ingestão, análise e investigação de logs IIS, Apache, Nginx, Java, SSH e FTP com dashboards e IA." },
      { property: "og:title", content: "LogSentinel AI" },
      { property: "og:description", content: "Observabilidade e investigação de logs Windows e Linux assistida por IA." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const features = [
  { icon: Monitor, title: "Windows", text: "IIS W3C, IIS FTP e Windows Event Log." },
  { icon: Terminal, title: "Linux", text: "Apache, Nginx, Java, SSH, syslog e vsftpd." },
  { icon: FileSearch, title: "Log Explorer", text: "Busca, filtros combinados e evento bruto." },
  { icon: Bell, title: "Alertas", text: "Regras por severidade, origem e volume." },
  { icon: BrainCircuit, title: "Investigação com IA", text: "Causa provável, correlação e recomendações." },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background bg-grid">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Logo />
        <Button asChild variant="outline" size="sm"><Link to="/auth">Entrar</Link></Button>
      </header>
      <section className="mx-auto max-w-6xl px-6 pb-20 pt-16">
        <p className="font-mono text-xs uppercase tracking-[0.25em] text-primary">NOC · SOC · Observabilidade</p>
        <h1 className="mt-4 max-w-3xl text-5xl font-bold leading-[1.05] md:text-6xl">
          Saiba em segundos <span className="text-gradient-primary">qual servidor</span> está falhando — e por quê.
        </h1>
        <p className="mt-6 max-w-xl text-lg text-muted-foreground">
          Centralize logs de servidores Windows e Linux, detecte erros e ataques e investigue incidentes com inteligência artificial.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg"><Link to="/auth">Começar agora <ArrowRight /></Link></Button>
          <Button asChild size="lg" variant="outline"><Link to="/dashboard">Abrir painel</Link></Button>
        </div>
        <div className="mt-16 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {features.map((f) => (
            <div key={f.title} className="rounded-lg border bg-card/70 p-4">
              <f.icon className="size-5 text-primary" />
              <div className="mt-3 font-display font-semibold">{f.title}</div>
              <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </div>
        <pre className="mt-12 overflow-x-auto rounded-lg border bg-sidebar p-4 font-mono text-xs leading-relaxed text-muted-foreground">
<span className="text-sev-error">2026-11-18 20:00:01 ERROR</span> WIN-PROD-01 IIS GET /api/pedidos 500 1532ms{"\n"}
<span className="text-sev-warn">Nov 18 20:00:03 WARN </span> LINUX-PROD-01 sshd Failed password for invalid user admin from 203.0.113.99{"\n"}
<span className="text-sev-critical">2026-11-18 20:00:05 CRIT </span> LINUX-HML-01 java.lang.OutOfMemoryError: Java heap space{"\n"}
<span className="text-primary">→ IA: provável vazamento de memória após deploy; 3 eventos correlacionados.</span>
        </pre>
      </section>
    </div>
  );
}
