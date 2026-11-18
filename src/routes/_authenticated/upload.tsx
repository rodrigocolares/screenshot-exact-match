import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SeverityBadge } from "@/components/app/SeverityBadge";
import { ingestLogFile } from "@/server/ingest.functions";
import { LOG_TYPES, parseLogs, type LogType } from "@/lib/logs/parsers";
import { fmtDate, fmtNum, SOURCE_LABEL } from "@/lib/logs/meta";

export const Route = createFileRoute("/_authenticated/upload")({
  head: () => ({ meta: [{ title: "Ingestão de logs — LogSentinel AI" }, { name: "description", content: "Envie arquivos de log para análise." }, { property: "og:title", content: "Ingestão de logs — LogSentinel AI" }, { property: "og:description", content: "Envie arquivos de log para análise." }] }),
  component: Upload,
});

const MAX = 5 * 1024 * 1024;
const ACCEPT = ".log,.txt,.csv,.json,.xml,.out";

function Upload() {
  const { data: org } = useOrg();
  const qc = useQueryClient();
  const ingest = useServerFn(ingestLogFile);
  const [os, setOs] = useState<"windows" | "linux">("linux");
  const [type, setType] = useState<LogType>("auto");
  const [serverId, setServerId] = useState<string>("none");
  const [file, setFile] = useState<{ name: string; content: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof ingest>> | null>(null);

  const { data: servers } = useQuery({
    queryKey: ["servers", org?.orgId, os],
    enabled: !!org,
    queryFn: async () => (await supabase.from("servers").select("id, hostname").eq("org_id", org!.orgId).eq("os", os).order("hostname")).data ?? [],
  });
  const { data: jobs } = useQuery({
    queryKey: ["jobs", org?.orgId],
    enabled: !!org,
    queryFn: async () => (await supabase.from("ingestion_jobs").select("*").eq("org_id", org!.orgId).order("created_at", { ascending: false }).limit(20)).data ?? [],
  });

  const preview = useMemo(() => (file ? parseLogs(file.content.slice(0, 60000), type) : null), [file, type]);

  async function onFile(f: File | undefined) {
    setResult(null);
    if (!f) return;
    if (f.size > MAX) return toast.error("Arquivo excede 5 MB. Divida o arquivo ou use a API de ingestão.");
    if (/\.(gz|zip|evtx)$/i.test(f.name)) return toast.error("Arquivos .gz, .zip e .evtx ainda não são suportados no upload. Extraia/converta para texto (ex.: Get-WinEvent | ConvertTo-Json).");
    setFile({ name: f.name, content: await f.text() });
  }

  async function submit() {
    if (!file || !org) return;
    setBusy(true);
    try {
      const r = await ingest({ data: { orgId: org.orgId, serverId: serverId === "none" ? null : serverId, logType: type, fileName: file.name, content: file.content } });
      setResult(r);
      toast.success(`${fmtNum(r.imported)} eventos importados`);
      qc.invalidateQueries();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na importação");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title="Ingestão de logs" description="Upload manual com detecção de formato, pré-visualização e deduplicação por hash." />
      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <div className="space-y-4 rounded-lg border bg-card p-4">
          <div className="space-y-1.5"><Label>Sistema operacional</Label>
            <Select value={os} onValueChange={(v) => { setOs(v as "windows" | "linux"); setServerId("none"); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="windows">Windows</SelectItem><SelectItem value="linux">Linux</SelectItem></SelectContent></Select>
          </div>
          <div className="space-y-1.5"><Label>Servidor</Label>
            <Select value={serverId} onValueChange={setServerId}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="none">Sem servidor associado</SelectItem>{servers?.map((s) => <SelectItem key={s.id} value={s.id}>{s.hostname}</SelectItem>)}</SelectContent>
            </Select>
            {!servers?.length && <p className="text-xs text-muted-foreground"><Link to="/servers" className="text-primary underline">Cadastre um servidor</Link> para associar os eventos.</p>}
          </div>
          <div className="space-y-1.5"><Label>Tipo de log</Label>
            <Select value={type} onValueChange={(v) => setType(v as LogType)}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{LOG_TYPES.filter((t) => t.os === "any" || t.os === os).map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-6 text-center text-sm hover:bg-primary/10">
            <FileUp className="size-6 text-primary" />
            <span>{file ? file.name : "Selecionar arquivo (.log, .txt, .json, .csv)"}</span>
            <span className="text-xs text-muted-foreground">Máx. 5 MB</span>
            <input type="file" accept={ACCEPT} className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
          <Button className="w-full" disabled={!file || busy} onClick={submit}>{busy ? <Loader2 className="animate-spin" /> : <FileUp />} Importar</Button>
          {result && (
            <div className="rounded border bg-muted/40 p-3 text-xs">
              <div className="mb-1 font-semibold">Resultado ({SOURCE_LABEL[result.detected] ?? result.detected})</div>
              <div className="grid grid-cols-2 gap-1 font-mono">
                <span>Linhas/eventos: {fmtNum(result.total)}</span><span className="text-success">Importados: {fmtNum(result.imported)}</span>
                <span className="text-sev-warn">Rejeitados: {fmtNum(result.rejected)}</span><span>Duplicados: {fmtNum(result.duplicated)}</span>
              </div>
              {result.alertsCreated > 0 && <div className="mt-2 text-sev-warn">{result.alertsCreated} alerta(s) disparado(s). <Link to="/alerts" className="underline">Ver</Link></div>}
              {result.sampleRejected.map((r) => <div key={r.line} className="mt-1 truncate text-muted-foreground">L{r.line}: {r.reason}</div>)}
            </div>
          )}
        </div>

        <div className="min-w-0 rounded-lg border bg-card p-4">
          <h3 className="mb-1 text-sm font-semibold">Pré-visualização</h3>
          {!preview && <p className="text-sm text-muted-foreground">Selecione um arquivo para ver como os eventos serão interpretados.</p>}
          {preview && (
            <>
              <p className="mb-3 text-xs text-muted-foreground">
                Formato: <b className="text-foreground">{SOURCE_LABEL[preview.detected] ?? preview.detected}</b> · {fmtNum(preview.events.length)} eventos válidos e {fmtNum(preview.rejected.length)} rejeitados na amostra
              </p>
              <div className="max-h-[480px] overflow-auto">
                <table className="w-full text-xs">
                  <tbody className="font-mono">
                    {preview.events.slice(0, 30).map((e, i) => (
                      <tr key={i} className="border-b border-border/50">
                        <td className="whitespace-nowrap py-1.5 pr-2 text-muted-foreground">{fmtDate(e.timestamp)}</td>
                        <td className="pr-2"><SeverityBadge severity={e.severity} /></td>
                        <td className="pr-2">{e.http_status ?? ""}</td>
                        <td className="max-w-[420px] truncate">{e.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.rejected.slice(0, 10).map((r) => <div key={r.line} className="mt-1 truncate font-mono text-xs text-sev-warn">L{r.line} · {r.reason}: {r.raw}</div>)}
              </div>
            </>
          )}
        </div>
      </div>

      <h3 className="mb-2 mt-8 text-sm font-semibold">Histórico de importações</h3>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr><th className="px-3 py-2">Data</th><th className="px-3 py-2">Arquivo</th><th className="px-3 py-2">Tipo</th><th className="px-3 py-2">Status</th><th className="px-3 py-2 text-right">Importados</th><th className="px-3 py-2 text-right">Rejeitados</th><th className="px-3 py-2 text-right">Duplicados</th></tr>
          </thead>
          <tbody className="text-xs">
            {jobs?.map((j) => (
              <tr key={j.id} className="border-b border-border/50">
                <td className="px-3 py-2 text-muted-foreground">{fmtDate(j.created_at)}</td>
                <td className="px-3 py-2 font-mono">{j.file_name}</td>
                <td className="px-3 py-2">{SOURCE_LABEL[j.log_type] ?? j.log_type}</td>
                <td className="px-3 py-2">{j.status}</td>
                <td className="px-3 py-2 text-right font-mono text-success">{fmtNum(j.lines_imported)}</td>
                <td className="px-3 py-2 text-right font-mono text-sev-warn">{fmtNum(j.lines_rejected)}</td>
                <td className="px-3 py-2 text-right font-mono">{fmtNum(j.lines_duplicated)}</td>
              </tr>
            ))}
            {jobs && !jobs.length && <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">Nenhuma importação ainda.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
