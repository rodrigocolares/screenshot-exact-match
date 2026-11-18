import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Check, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmtDate, SEVERITIES, SEVERITY_LABEL, SOURCE_LABEL } from "@/lib/logs/meta";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/alerts")({
  head: () => ({ meta: [{ title: "Alertas — LogSentinel AI" }, { name: "description", content: "Regras e ocorrências de alertas." }, { property: "og:title", content: "Alertas — LogSentinel AI" }, { property: "og:description", content: "Regras e ocorrências de alertas." }] }),
  component: Alerts,
});

const LEVEL_CLS: Record<string, string> = { low: "text-sev-info", medium: "text-sev-warn", high: "text-sev-error", critical: "text-sev-critical" };
const LEVEL_LABEL: Record<string, string> = { low: "Baixa", medium: "Média", high: "Alta", critical: "Crítica" };

function Alerts() {
  const { data: org } = useOrg();
  const qc = useQueryClient();
  const { data: occ } = useQuery({
    queryKey: ["alert_occ", org?.orgId],
    enabled: !!org,
    refetchInterval: 30000,
    queryFn: async () => (await supabase.from("alert_occurrences").select("*, alert_rules(name, alert_severity)").eq("org_id", org!.orgId).order("triggered_at", { ascending: false }).limit(100)).data ?? [],
  });
  const { data: rules } = useQuery({
    queryKey: ["alert_rules", org?.orgId],
    enabled: !!org,
    queryFn: async () => (await supabase.from("alert_rules").select("*").eq("org_id", org!.orgId).order("created_at")).data ?? [],
  });

  async function setStatus(id: string, status: string) {
    await supabase.from("alert_occurrences").update({ status }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["alert_occ"] });
  }
  async function toggle(id: string, enabled: boolean) {
    await supabase.from("alert_rules").update({ enabled }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["alert_rules"] });
  }
  async function evaluate() {
    const { data, error } = await supabase.rpc("evaluate_alerts", { _org: org!.orgId });
    if (error) return toast.error(error.message);
    toast.success(data ? `${data} novo(s) alerta(s)` : "Nenhum novo alerta");
    qc.invalidateQueries({ queryKey: ["alert_occ"] });
  }

  return (
    <div>
      <PageHeader title="Alertas" description="Regras avaliadas a cada ingestão de logs." actions={<><Button variant="outline" onClick={evaluate}><RefreshCw /> Avaliar agora</Button><NewRule /></>} />
      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <div className="rounded-lg border bg-card">
          <div className="border-b px-4 py-3 text-sm font-semibold">Ocorrências</div>
          <ul className="divide-y divide-border/60">
            {occ?.map((o) => {
              const rule = o.alert_rules as { name: string; alert_severity: string } | null;
              return (
                <li key={o.id} className={cn("flex items-center gap-3 px-4 py-3 text-sm", o.status === "resolved" && "opacity-50")}>
                  <span className={cn("size-2 rounded-full bg-current", LEVEL_CLS[rule?.alert_severity ?? "medium"], o.status === "open" && "animate-pulse-dot")} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{o.message}</div>
                    <div className="text-xs text-muted-foreground">{fmtDate(o.triggered_at)} · {o.status === "open" ? "aberto" : o.status === "acknowledged" ? "reconhecido" : "resolvido"}</div>
                  </div>
                  {o.status === "open" && <Button size="sm" variant="outline" onClick={() => setStatus(o.id, "acknowledged")}>Reconhecer</Button>}
                  {o.status !== "resolved" && <Button size="sm" variant="ghost" onClick={() => setStatus(o.id, "resolved")}><Check /> Resolver</Button>}
                </li>
              );
            })}
            {occ && !occ.length && <li className="px-4 py-10 text-center text-sm text-muted-foreground">Nenhum alerta disparado.</li>}
          </ul>
        </div>
        <div className="rounded-lg border bg-card">
          <div className="border-b px-4 py-3 text-sm font-semibold">Regras</div>
          <ul className="divide-y divide-border/60">
            {rules?.map((r) => (
              <li key={r.id} className="flex items-start gap-3 px-4 py-3 text-sm">
                <div className="flex-1">
                  <div className="font-medium">{r.name} <span className={cn("ml-1 text-xs", LEVEL_CLS[r.alert_severity])}>{LEVEL_LABEL[r.alert_severity]}</span></div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    ≥ {r.threshold} eventos {SEVERITY_LABEL[r.min_severity]}+ em {r.window_minutes} min
                    {r.source_type && ` · ${SOURCE_LABEL[r.source_type] ?? r.source_type}`}
                    {r.message_contains && ` · contém "${r.message_contains}"`}
                  </div>
                </div>
                <Switch checked={r.enabled} onCheckedChange={(v) => toggle(r.id, v)} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function NewRule() {
  const { data: org } = useOrg();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", min_severity: "ERROR", source_type: "any", message_contains: "", threshold: 10, window_minutes: 15, alert_severity: "high" });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("alert_rules").insert({
      org_id: org!.orgId, name: f.name, min_severity: f.min_severity, source_type: f.source_type === "any" ? null : f.source_type,
      message_contains: f.message_contains || null, threshold: f.threshold, window_minutes: f.window_minutes, alert_severity: f.alert_severity,
    });
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["alert_rules"] });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus /> Nova regra</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Nova regra de alerta</DialogTitle></DialogHeader>
        <form onSubmit={save} className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5"><Label>Nome</Label><Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ex.: Muitos 5xx no IIS" /></div>
          <div className="space-y-1.5"><Label>Severidade mínima</Label>
            <Select value={f.min_severity} onValueChange={(v) => setF({ ...f, min_severity: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{SEVERITIES.map((s) => <SelectItem key={s} value={s}>{SEVERITY_LABEL[s]}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="space-y-1.5"><Label>Origem</Label>
            <Select value={f.source_type} onValueChange={(v) => setF({ ...f, source_type: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="any">Qualquer</SelectItem>{Object.entries(SOURCE_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="col-span-2 space-y-1.5"><Label>Mensagem ou categoria contém (opcional)</Label><Input value={f.message_contains} onChange={(e) => setF({ ...f, message_contains: e.target.value })} placeholder="timeout" /></div>
          <div className="space-y-1.5"><Label>Limite (eventos)</Label><Input type="number" min={1} value={f.threshold} onChange={(e) => setF({ ...f, threshold: Number(e.target.value) })} /></div>
          <div className="space-y-1.5"><Label>Janela (minutos)</Label><Input type="number" min={1} value={f.window_minutes} onChange={(e) => setF({ ...f, window_minutes: Number(e.target.value) })} /></div>
          <div className="col-span-2 space-y-1.5"><Label>Prioridade do alerta</Label>
            <Select value={f.alert_severity} onValueChange={(v) => setF({ ...f, alert_severity: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(LEVEL_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
          </div>
          <DialogFooter className="col-span-2"><Button type="submit">Criar regra</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
