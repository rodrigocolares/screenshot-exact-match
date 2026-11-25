import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, AlertTriangle, Bell, Clock, Flame, KeyRound, Monitor, Server, Terminal, TimerOff, Layers, Database } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { PageHeader } from "@/components/app/AppShell";
import { Panel, StatCard } from "@/components/app/StatCard";
import { RangeControls } from "@/components/app/RangeControls";
import { fmtDate, fmtNum, rangeOf, SEVERITY_LABEL, SEVERITY_VAR, SOURCE_LABEL } from "@/lib/logs/meta";
import { Button } from "@/components/ui/button";

const search = z.object({ range: z.string().default("24h"), refresh: z.number().default(30) });

export const Route = createFileRoute("/_authenticated/dashboard")({
  validateSearch: search,
  head: () => ({ meta: [{ title: "Dashboard — LogSentinel AI" }, { name: "description", content: "Visão executiva dos logs e alertas." }, { property: "og:title", content: "Dashboard — LogSentinel AI" }, { property: "og:description", content: "Visão executiva dos logs e alertas." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: Dashboard,
});

type Stats = {
  total_events: number; events_24h: number; period_events: number; servers: number; servers_windows: number; servers_linux: number;
  errors: number; critical: number; active_alerts: number; auth_failures: number; last_ingest: string | null; stale_sources: number;
  timeline: { bucket: string; total: number; errors: number; warnings: number }[];
  by_severity: { severity: string; count: number }[];
  by_os: { os: string; errors: number; total: number }[];
  top_servers: { hostname: string; errors: number }[];
  top_apps: { app: string; errors: number }[];
  http_classes: { class: string; count: number }[];
  by_source: { source_type: string; count: number }[];
  auth_timeline: { bucket: string; count: number }[];
  previous_period_events: number; previous_period_errors: number;
};

const tt = { contentStyle: { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }, labelStyle: { color: "var(--muted-foreground)" } };
const axis = { stroke: "var(--muted-foreground)", fontSize: 11, tickLine: false, axisLine: false };
const HTTP_COLORS: Record<string, string> = { "2xx": "var(--success)", "3xx": "var(--sev-info)", "4xx": "var(--sev-warn)", "5xx": "var(--sev-error)" };

function delta(cur: number, prev: number) {
  if (!prev) return cur ? "sem dados no período anterior" : "estável";
  const p = Math.round(((cur - prev) / prev) * 100);
  return `${p >= 0 ? "+" : ""}${p}% vs. período anterior`;
}

function Dashboard() {
  const { range, refresh } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: org } = useOrg();
  const r = rangeOf(range);

  const { data: s, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ["dashboard", org?.orgId, range],
    enabled: !!org,
    refetchInterval: refresh ? refresh * 1000 : false,
    queryFn: async () => {
      const since = new Date(Date.now() - r.ms).toISOString();
      const { data, error } = await supabase.rpc("dashboard_stats", { _org: org!.orgId, _since: since, _bucket: r.bucket });
      if (error) throw error;
      return data as unknown as Stats;
    },
  });

  const fmtBucket = (b: string) => new Date(b).toLocaleString("pt-BR", r.bucket === "day" ? { day: "2-digit", month: "2-digit" } : { hour: "2-digit", minute: "2-digit" });

  return (
    <div>
      <PageHeader
        title="Dashboard executivo"
        description={dataUpdatedAt ? `Atualizado às ${new Date(dataUpdatedAt).toLocaleTimeString("pt-BR")}` : "Carregando…"}
        actions={<RangeControls range={range} onRange={(v) => navigate({ search: (p) => ({ ...p, range: v }) })} refresh={refresh} onRefresh={(v) => navigate({ search: (p) => ({ ...p, refresh: v }) })} />}
      />
      {!isLoading && s && s.total_events === 0 && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/40 bg-primary/5 p-4 text-sm">
          <span>Nenhum evento recebido ainda. Envie um arquivo de log ou carregue os dados de demonstração (fictícios).</span>
          <div className="flex gap-2">
            <Button asChild size="sm"><Link to="/upload">Enviar logs</Link></Button>
            <Button asChild size="sm" variant="outline"><Link to="/settings">Dados de demonstração</Link></Button>
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <StatCard label="Total de eventos" value={fmtNum(s?.total_events)} icon={Database} />
        <StatCard label="Eventos 24h" value={fmtNum(s?.events_24h)} icon={Activity} />
        <StatCard label="Servidores" value={fmtNum(s?.servers)} icon={Server} />
        <StatCard label="Windows" value={fmtNum(s?.servers_windows)} icon={Monitor} />
        <StatCard label="Linux" value={fmtNum(s?.servers_linux)} icon={Terminal} />
        <StatCard label="Erros no período" value={fmtNum(s?.errors)} icon={AlertTriangle} tone="error" hint={s ? delta(s.errors, s.previous_period_errors) : undefined} />
        <StatCard label="Críticos" value={fmtNum(s?.critical)} icon={Flame} tone="critical" />
        <StatCard label="Alertas ativos" value={fmtNum(s?.active_alerts)} icon={Bell} tone="warn" />
        <StatCard label="Falhas de autenticação" value={fmtNum(s?.auth_failures)} icon={KeyRound} tone="warn" />
        <StatCard label="Eventos no período" value={fmtNum(s?.period_events)} icon={Layers} hint={s ? delta(s.period_events, s.previous_period_events) : undefined} />
        <StatCard label="Última coleta" value={s?.last_ingest ? new Date(s.last_ingest).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—"} icon={Clock} hint={fmtDate(s?.last_ingest)} />
        <StatCard label="Fontes atrasadas (>1h)" value={fmtNum(s?.stale_sources)} icon={TimerOff} tone={s?.stale_sources ? "warn" : "success"} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel title="Volume de logs e erros" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={s?.timeline ?? []}>
              <defs>
                <linearGradient id="gT" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--primary)" stopOpacity={0.4} /><stop offset="100%" stopColor="var(--primary)" stopOpacity={0} /></linearGradient>
                <linearGradient id="gE" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--sev-error)" stopOpacity={0.5} /><stop offset="100%" stopColor="var(--sev-error)" stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="bucket" tickFormatter={fmtBucket} {...axis} />
              <YAxis {...axis} width={40} />
              <Tooltip {...tt} labelFormatter={(l) => fmtDate(String(l))} />
              <Area type="monotone" dataKey="total" name="Total" stroke="var(--primary)" fill="url(#gT)" strokeWidth={2} />
              <Area type="monotone" dataKey="warnings" name="Alertas" stroke="var(--sev-warn)" fill="transparent" strokeWidth={1.5} />
              <Area type="monotone" dataKey="errors" name="Erros" stroke="var(--sev-error)" fill="url(#gE)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Distribuição por severidade">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={(s?.by_severity ?? []).map((x) => ({ ...x, name: SEVERITY_LABEL[x.severity] }))} dataKey="count" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2} stroke="var(--card)">
                {(s?.by_severity ?? []).map((x) => <Cell key={x.severity} fill={SEVERITY_VAR[x.severity]} />)}
              </Pie>
              <Tooltip {...tt} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Top 10 servidores com mais erros">
          <HBar data={(s?.top_servers ?? []).map((x) => ({ name: x.hostname, value: x.errors }))} color="var(--sev-error)" onClick={(n) => navigate({ to: "/explorer", search: { host: n, severity: "ERROR" } })} />
        </Panel>
        <Panel title="Top 10 aplicações com mais erros">
          <HBar data={(s?.top_apps ?? []).map((x) => ({ name: x.app, value: x.errors }))} color="var(--sev-critical)" />
        </Panel>
        <Panel title="Códigos HTTP">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={s?.http_classes ?? []}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="class" {...axis} />
              <YAxis {...axis} width={40} />
              <Tooltip {...tt} cursor={{ fill: "var(--muted)" }} />
              <Bar dataKey="count" name="Requisições" radius={[4, 4, 0, 0]}>
                {(s?.http_classes ?? []).map((x) => <Cell key={x.class} fill={HTTP_COLORS[x.class] ?? "var(--muted-foreground)"} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Falhas de autenticação ao longo do tempo">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={s?.auth_timeline ?? []}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="bucket" tickFormatter={fmtBucket} {...axis} />
              <YAxis {...axis} width={32} />
              <Tooltip {...tt} labelFormatter={(l) => fmtDate(String(l))} />
              <Area type="monotone" dataKey="count" name="Falhas" stroke="var(--sev-warn)" fill="var(--sev-warn)" fillOpacity={0.15} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Erros por sistema operacional">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={s?.by_os ?? []}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="os" {...axis} />
              <YAxis {...axis} width={40} />
              <Tooltip {...tt} cursor={{ fill: "var(--muted)" }} />
              <Bar dataKey="total" name="Total" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="errors" name="Erros" fill="var(--sev-error)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Eventos por origem">
          <HBar data={(s?.by_source ?? []).map((x) => ({ name: SOURCE_LABEL[x.source_type] ?? x.source_type, value: x.count, key: x.source_type }))} color="var(--primary)" onClick={(_, k) => navigate({ to: "/explorer", search: { source: k } })} />
        </Panel>
      </div>
    </div>
  );
}

function HBar({ data, color, onClick }: { data: { name: string; value: number; key?: string }[]; color: string; onClick?: (name: string, key?: string) => void }) {
  if (!data.length) return <div className="grid h-[220px] place-items-center text-sm text-muted-foreground">Sem dados no período</div>;
  return (
    <ResponsiveContainer width="100%" height={Math.max(220, data.length * 26)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8 }}>
        <XAxis type="number" {...axis} />
        <YAxis type="category" dataKey="name" width={130} {...axis} />
        <Tooltip {...tt} cursor={{ fill: "var(--muted)" }} />
        <Bar dataKey="value" name="Eventos" fill={color} radius={[0, 4, 4, 0]} className={onClick ? "cursor-pointer" : ""} onClick={(d: { name: string; key?: string }) => onClick?.(d.name, d.key)} />
      </BarChart>
    </ResponsiveContainer>
  );
}
