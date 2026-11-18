import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Bookmark, ChevronLeft, ChevronRight, Download, Search, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { PageHeader } from "@/components/app/AppShell";
import { RangeControls } from "@/components/app/RangeControls";
import { SeverityBadge } from "@/components/app/SeverityBadge";
import { EventSheet, type LogEvent } from "@/components/app/EventSheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { fmtNum, rangeOf, SEVERITIES, SEVERITY_LABEL, SOURCE_LABEL } from "@/lib/logs/meta";

const search = z.object({
  q: z.string().optional(),
  os: z.string().optional(),
  severity: z.string().optional(),
  source: z.string().optional(),
  host: z.string().optional(),
  ip: z.string().optional(),
  user: z.string().optional(),
  status: z.string().optional(),
  category: z.string().optional(),
  range: z.string().default("7d"),
  page: z.number().default(0),
});
type S = z.infer<typeof search>;

export const Route = createFileRoute("/_authenticated/explorer")({
  validateSearch: search,
  head: () => ({ meta: [{ title: "Log Explorer — LogSentinel AI" }, { name: "description", content: "Busque e filtre eventos de log." }, { property: "og:title", content: "Log Explorer — LogSentinel AI" }, { property: "og:description", content: "Busque e filtre eventos de log." }] }),
  component: Explorer,
});

const PAGE = 50;
const SEV_RANK = SEVERITIES;

function buildQuery(orgId: string, s: S, select = "*", count = true) {
  let q = supabase.from("log_events").select(select, count ? { count: "exact" } : undefined).eq("org_id", orgId);
  q = q.gte("timestamp", new Date(Date.now() - rangeOf(s.range).ms).toISOString());
  if (s.q) q = q.ilike("message", `%${s.q.replace(/[%_]/g, "\\$&")}%`);
  if (s.os) q = q.eq("operating_system", s.os);
  if (s.severity) q = q.in("severity", SEV_RANK.slice(SEV_RANK.indexOf(s.severity as never)) as unknown as string[]);
  if (s.source) q = q.eq("source_type", s.source);
  if (s.host) q = q.ilike("hostname", `%${s.host}%`);
  if (s.ip) q = q.eq("client_ip", s.ip);
  if (s.user) q = q.ilike("username", `%${s.user}%`);
  if (s.category) q = q.eq("event_category", s.category);
  if (s.status) {
    if (/^\dxx$/.test(s.status)) q = q.gte("http_status", Number(s.status[0]) * 100).lt("http_status", Number(s.status[0]) * 100 + 100);
    else if (!isNaN(Number(s.status))) q = q.eq("http_status", Number(s.status));
  }
  return q;
}

function Explorer() {
  const s = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: org } = useOrg();
  const qc = useQueryClient();
  const [text, setText] = useState(s.q ?? "");
  const [selected, setSelected] = useState<LogEvent | null>(null);
  useEffect(() => setText(s.q ?? ""), [s.q]);

  const set = (patch: Partial<S>) => navigate({ search: (p) => ({ ...p, ...patch, page: patch.page ?? 0 }) });

  const { data, isFetching, error } = useQuery({
    queryKey: ["events", org?.orgId, s],
    enabled: !!org,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, count, error } = await buildQuery(org!.orgId, s).order("timestamp", { ascending: false }).range(s.page * PAGE, s.page * PAGE + PAGE - 1);
      if (error) throw error;
      return { rows: (data ?? []) as unknown as LogEvent[], count: count ?? 0 };
    },
  });

  const { data: saved } = useQuery({
    queryKey: ["saved_queries", org?.orgId],
    enabled: !!org,
    queryFn: async () => (await supabase.from("saved_queries").select("*").eq("org_id", org!.orgId).order("created_at", { ascending: false })).data ?? [],
  });

  async function exportAs(fmt: "csv" | "json") {
    const { data, error } = await buildQuery(org!.orgId, s, "*", false).order("timestamp", { ascending: false }).limit(5000);
    if (error) return toast.error(error.message);
    const rows = (data ?? []) as unknown as LogEvent[];
    let blob: Blob;
    if (fmt === "json") blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
    else {
      const cols = ["timestamp", "severity", "operating_system", "hostname", "source_type", "service_name", "event_category", "client_ip", "username", "http_method", "http_status", "request_path", "response_time", "message"] as const;
      const escCsv = (v: unknown) => (v === null || v === undefined ? "" : `"${String(v).replace(/"/g, '""')}"`);
      blob = new Blob([[cols.join(","), ...rows.map((r) => cols.map((c) => escCsv(r[c])).join(","))].join("\n")], { type: "text/csv" });
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `logsentinel-eventos.${fmt}`;
    a.click();
    toast.success(`${rows.length} eventos exportados`);
  }

  async function saveQuery() {
    const name = window.prompt("Nome da pesquisa:");
    if (!name) return;
    const { page: _p, ...filters } = s;
    const { error } = await supabase.from("saved_queries").insert({ org_id: org!.orgId, user_id: org!.userId, name, filters });
    if (error) toast.error(error.message);
    else { toast.success("Pesquisa salva"); qc.invalidateQueries({ queryKey: ["saved_queries"] }); }
  }

  const activeChips = (["os", "severity", "source", "host", "ip", "user", "status", "category"] as const).filter((k) => s[k]);
  const pages = Math.ceil((data?.count ?? 0) / PAGE);

  return (
    <div>
      <PageHeader
        title="Log Explorer"
        description={`${fmtNum(data?.count)} eventos encontrados${isFetching ? " · buscando…" : ""}`}
        actions={
          <>
            <RangeControls range={s.range} onRange={(v) => set({ range: v })} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="outline"><Bookmark /> Pesquisas</Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuItem onClick={saveQuery}>Salvar pesquisa atual…</DropdownMenuItem>
                {!!saved?.length && <DropdownMenuSeparator />}
                {saved?.map((q) => (
                  <DropdownMenuItem key={q.id} onClick={() => navigate({ search: { ...(q.filters as object), page: 0 } as S })}>{q.name}</DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="outline"><Download /> Exportar</Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => exportAs("csv")}>CSV</DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportAs("json")}>JSON</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); set({ q: text || undefined }); }}>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Buscar na mensagem (ex.: timeout, NullPointerException, Failed password)" className="pl-9 font-mono text-sm" />
        </div>
        <Button type="submit">Buscar</Button>
      </form>

      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
        <Sel value={s.os} onChange={(v) => set({ os: v })} placeholder="Sistema" options={[["windows", "Windows"], ["linux", "Linux"]]} />
        <Sel value={s.severity} onChange={(v) => set({ severity: v })} placeholder="Severidade mín." options={SEVERITIES.map((x) => [x, `≥ ${SEVERITY_LABEL[x]}`])} />
        <Sel value={s.source} onChange={(v) => set({ source: v })} placeholder="Origem" options={Object.entries(SOURCE_LABEL)} />
        <Sel value={s.status} onChange={(v) => set({ status: v })} placeholder="HTTP" options={[["2xx", "2xx"], ["3xx", "3xx"], ["4xx", "4xx"], ["5xx", "5xx"], ["404", "404"], ["500", "500"], ["503", "503"]]} />
        <Sel value={s.category} onChange={(v) => set({ category: v })} placeholder="Categoria" options={[["auth_failure", "Falha de autenticação"], ["exception", "Exceção"], ["http_error", "Erro HTTP"], ["suspicious_request", "Requisição suspeita"], ["upstream_timeout", "Upstream timeout"], ["service_failure", "Falha de serviço"], ["transfer_failure", "Falha de transferência"]]} />
        <TextFilter value={s.host} onChange={(v) => set({ host: v })} placeholder="Hostname" />
        <TextFilter value={s.ip} onChange={(v) => set({ ip: v })} placeholder="IP exato" />
        <TextFilter value={s.user} onChange={(v) => set({ user: v })} placeholder="Usuário" />
      </div>

      {activeChips.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {activeChips.map((k) => (
            <button key={k} onClick={() => set({ [k]: undefined })} className="inline-flex items-center gap-1 rounded-full border bg-muted px-2.5 py-0.5 font-mono text-xs">
              {k}={s[k]} <X className="size-3" />
            </button>
          ))}
          <button onClick={() => navigate({ search: { range: s.range, page: 0 } })} className="text-xs text-muted-foreground underline">limpar tudo</button>
        </div>
      )}

      {error && <div className="mt-4 rounded border border-destructive/50 bg-destructive/10 p-3 text-sm">{(error as Error).message}</div>}

      <div className="mt-4 overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr><th className="px-3 py-2">Horário</th><th className="px-3 py-2">Sev.</th><th className="px-3 py-2">Host</th><th className="px-3 py-2">Origem</th><th className="px-3 py-2">HTTP</th><th className="px-3 py-2">Mensagem</th></tr>
          </thead>
          <tbody className="font-mono text-xs">
            {data?.rows.map((r) => (
              <tr key={r.id} onClick={() => setSelected(r)} className="cursor-pointer border-b border-border/50 hover:bg-accent/40">
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{new Date(r.timestamp).toLocaleString("pt-BR")}</td>
                <td className="px-3 py-2"><SeverityBadge severity={r.severity} /></td>
                <td className="whitespace-nowrap px-3 py-2">{r.hostname ?? "—"}</td>
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{SOURCE_LABEL[r.source_type] ?? r.source_type}</td>
                <td className="px-3 py-2">{r.http_status ?? ""}</td>
                <td className="max-w-[560px] truncate px-3 py-2">{r.message}</td>
              </tr>
            ))}
            {data && !data.rows.length && <tr><td colSpan={6} className="px-3 py-12 text-center font-sans text-muted-foreground">Nenhum evento para estes filtros.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-end gap-2 text-sm text-muted-foreground">
        Página {s.page + 1} de {Math.max(1, pages)}
        <Button size="icon" variant="outline" disabled={s.page === 0} onClick={() => set({ page: s.page - 1 })}><ChevronLeft /></Button>
        <Button size="icon" variant="outline" disabled={s.page + 1 >= pages} onClick={() => set({ page: s.page + 1 })}><ChevronRight /></Button>
      </div>

      <EventSheet event={selected} onOpenChange={(o) => !o && setSelected(null)} />
    </div>
  );
}

function Sel({ value, onChange, placeholder, options }: { value?: string; onChange: (v?: string) => void; placeholder: string; options: [string, string][] }) {
  return (
    <Select value={value ?? "__all"} onValueChange={(v) => onChange(v === "__all" ? undefined : v)}>
      <SelectTrigger className="w-full"><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        <SelectItem value="__all">{placeholder}: todos</SelectItem>
        {options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function TextFilter({ value, onChange, placeholder }: { value?: string; onChange: (v?: string) => void; placeholder: string }) {
  const [v, setV] = useState(value ?? "");
  useEffect(() => setV(value ?? ""), [value]);
  return <Input value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={() => onChange(v || undefined)} onKeyDown={(e) => e.key === "Enter" && onChange(v || undefined)} />;
}
