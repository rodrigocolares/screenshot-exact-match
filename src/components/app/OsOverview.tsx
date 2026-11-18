import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Server } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { PageHeader } from "./AppShell";
import { fmtDate, fmtNum } from "@/lib/logs/meta";
import { SeverityBadge } from "./SeverityBadge";

type Src = { key: string; label: string; desc: string; quick?: { label: string; search: Record<string, string> }[] };

export function OsOverview({ os, title, description, sources }: { os: "windows" | "linux"; title: string; description: string; sources: Src[] }) {
  const { data: org } = useOrg();
  const since = new Date(Date.now() - 7 * 86400e3).toISOString();

  const { data: counts } = useQuery({
    queryKey: ["os-sources", org?.orgId, os],
    enabled: !!org,
    queryFn: async () => {
      const res = await Promise.all(
        sources.map(async (s) => {
          const b = () => supabase.from("log_events").select("id", { count: "exact", head: true }).eq("org_id", org!.orgId).eq("source_type", s.key).gte("timestamp", since);
          const [t, e] = await Promise.all([b(), b().in("severity", ["ERROR", "CRITICAL"])]);
          return [s.key, { total: t.count ?? 0, errors: e.count ?? 0 }] as const;
        }),
      );
      return Object.fromEntries(res);
    },
  });

  const { data: servers } = useQuery({
    queryKey: ["servers", org?.orgId, os],
    enabled: !!org,
    queryFn: async () => (await supabase.from("servers").select("*").eq("org_id", org!.orgId).eq("os", os).order("hostname")).data ?? [],
  });

  const { data: recent } = useQuery({
    queryKey: ["os-recent", org?.orgId, os],
    enabled: !!org,
    queryFn: async () =>
      (await supabase.from("log_events").select("id, timestamp, severity, hostname, source_type, message").eq("org_id", org!.orgId).eq("operating_system", os).in("severity", ["ERROR", "CRITICAL"]).order("timestamp", { ascending: false }).limit(8)).data ?? [],
  });

  return (
    <div>
      <PageHeader title={title} description={description} />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {sources.map((s) => {
          const c = counts?.[s.key];
          return (
            <div key={s.key} className="flex flex-col rounded-lg border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold">{s.label}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{s.desc}</p>
                </div>
                <Link to="/explorer" search={{ source: s.key }} className="text-primary"><ArrowRight className="size-4" /></Link>
              </div>
              <div className="mt-4 flex gap-6 font-mono">
                <div><div className="text-xl font-semibold">{fmtNum(c?.total)}</div><div className="text-[11px] text-muted-foreground">eventos 7d</div></div>
                <div><div className="text-xl font-semibold text-sev-error">{fmtNum(c?.errors)}</div><div className="text-[11px] text-muted-foreground">erros 7d</div></div>
              </div>
              {s.quick && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {s.quick.map((q) => (
                    <Link key={q.label} to="/explorer" search={{ source: s.key, ...q.search }} className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground hover:border-primary hover:text-primary">{q.label}</Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border bg-card p-4">
          <h3 className="mb-3 text-sm font-semibold">Servidores {os === "windows" ? "Windows" : "Linux"}</h3>
          {!servers?.length && <p className="text-sm text-muted-foreground">Nenhum servidor cadastrado. <Link to="/servers" className="text-primary underline">Cadastrar</Link></p>}
          <ul className="divide-y divide-border/60">
            {servers?.map((sv) => {
              const stale = !sv.last_seen_at || Date.now() - new Date(sv.last_seen_at).getTime() > 3600e3;
              return (
                <li key={sv.id} className="flex items-center gap-3 py-2 text-sm">
                  <Server className={stale ? "size-4 text-sev-warn" : "size-4 text-success"} />
                  <Link to="/explorer" search={{ host: sv.hostname }} className="font-mono hover:text-primary">{sv.hostname}</Link>
                  <span className="text-xs text-muted-foreground">{sv.os_version}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{stale ? "coleta atrasada · " : ""}{fmtDate(sv.last_seen_at)}</span>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <h3 className="mb-3 text-sm font-semibold">Erros recentes</h3>
          {!recent?.length && <p className="text-sm text-muted-foreground">Sem erros recentes.</p>}
          <ul className="space-y-2">
            {recent?.map((e) => (
              <li key={e.id} className="flex items-start gap-2 text-xs">
                <SeverityBadge severity={e.severity} />
                <div className="min-w-0">
                  <div className="truncate font-mono">{e.message}</div>
                  <div className="text-muted-foreground">{e.hostname} · {fmtDate(e.timestamp)}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
