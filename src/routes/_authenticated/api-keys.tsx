import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Copy, KeyRound, Plus, RotateCw, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { createApiKey } from "@/lib/api/keys.functions";
import { PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fmtDate } from "@/lib/logs/meta";

const T = "Chaves de API — LogSentinel AI";
const D = "Crie, rotacione e revogue chaves para a ingestão automática de logs.";
export const Route = createFileRoute("/_authenticated/api-keys")({
  head: () => ({ meta: [{ title: T }, { name: "description", content: D }, { property: "og:title", content: T }, { property: "og:description", content: D }] }),
  component: ApiKeys,
});

type KeyRow = { id: string; name: string; description: string | null; key_prefix: string; server_id: string | null; expires_at: string | null; revoked_at: string | null; last_used_at: string | null; rate_limit_per_minute: number; created_at: string };

function status(k: KeyRow) {
  if (k.revoked_at) return { label: "Revogada", cls: "text-destructive" };
  if (k.expires_at && new Date(k.expires_at) <= new Date()) return { label: "Expirada", cls: "text-muted-foreground" };
  return { label: "Ativa", cls: "text-primary" };
}

function ApiKeys() {
  const orgQ = useOrg();
  const org = orgQ.data;
  const qc = useQueryClient();
  const create = useServerFn(createApiKey);
  const isAdmin = org?.role === "admin";
  const [open, setOpen] = useState(false);
  const [rotate, setRotate] = useState<KeyRow | null>(null);
  const [form, setForm] = useState({ name: "", description: "", serverId: "", days: "90", rate: "120" });
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

  async function sendTest(key: string) {
    setTestResult("Enviando…");
    const host = servers?.find((s) => s.id === form.serverId)?.hostname ?? "LOGSENTINEL-TESTE";
    const res = await fetch("/api/v1/logs/ingest", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ hostname: host, operating_system: "linux", source_type: "generic", events: [{ external_id: `teste-${Date.now()}`, timestamp: new Date().toISOString(), severity: "INFO", message: "Evento de teste da API de ingestão LogSentinel" }] }),
    });
    setTestResult(`HTTP ${res.status} — ${await res.text()}`);
    qc.invalidateQueries({ queryKey: ["api-keys", org!.orgId] });
  }

  const { data: keys } = useQuery({
    queryKey: ["api-keys", org?.orgId], enabled: !!org && isAdmin,
    queryFn: async () => ((await supabase.from("ingestion_api_keys").select("id, name, description, key_prefix, server_id, expires_at, revoked_at, last_used_at, rate_limit_per_minute, created_at").eq("org_id", org!.orgId).order("created_at", { ascending: false })).data ?? []) as KeyRow[],
  });
  const { data: servers } = useQuery({
    queryKey: ["servers", org?.orgId, "min"], enabled: !!org,
    queryFn: async () => (await supabase.from("servers").select("id, hostname").eq("org_id", org!.orgId).order("hostname")).data ?? [],
  });
  const { data: usage } = useQuery({
    queryKey: ["api-key-usage", selected], enabled: !!selected,
    queryFn: async () => (await supabase.from("ingestion_api_requests").select("id, endpoint, status_code, events, error, created_at").eq("api_key_id", selected!).order("created_at", { ascending: false }).limit(50)).data ?? [],
  });

  function openNew(from?: KeyRow) {
    setRotate(from ?? null);
    setForm({ name: from ? `${from.name} (rotacionada)` : "", description: from?.description ?? "", serverId: from?.server_id ?? "", days: "90", rate: String(from?.rate_limit_per_minute ?? 120) });
    setSecret(null); setTestResult(null); setOpen(true);
  }

  async function submit() {
    if (!org) return;
    setBusy(true);
    try {
      const days = Number(form.days);
      const r = await create({ data: {
        orgId: org!.orgId, name: form.name, description: form.description || undefined, serverId: form.serverId || null,
        expiresAt: days > 0 ? new Date(Date.now() + days * 86400_000).toISOString() : null, rateLimit: Number(form.rate) || 120,
        ...(rotate ? { rotateFrom: rotate.id } : {}),
      } });
      setSecret(r.key);
      qc.invalidateQueries({ queryKey: ["api-keys", org!.orgId] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao criar chave"); }
    setBusy(false);
  }

  async function revoke(k: KeyRow) {
    if (!confirm(`Revogar a chave "${k.name}"? Coletores que a usam deixarão de enviar logs.`)) return;
    const { error } = await supabase.from("ingestion_api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", k.id);
    if (error) toast.error(error.message); else { toast.success("Chave revogada"); qc.invalidateQueries({ queryKey: ["api-keys", org!.orgId] }); }
  }

  const host = (id: string | null) => servers?.find((s) => s.id === id)?.hostname ?? "Qualquer servidor";
  const endpoint = typeof window !== "undefined" ? `${window.location.origin}/api/v1/logs/ingest` : "/api/v1/logs/ingest";

  if (org && !isAdmin) return <div><PageHeader title="Chaves de API" description={D} /><p className="text-sm text-muted-foreground">Somente administradores da organização podem gerenciar chaves de API.</p></div>;

  return (
    <div>
      <PageHeader title="Chaves de API" description={D} actions={<Button disabled={!org} onClick={() => openNew()}><Plus className="mr-1 h-4 w-4" />Nova chave</Button>} />
      <div className="mb-4 rounded-lg border bg-card p-4 text-sm">
        <p className="font-medium">Endpoint de ingestão</p>
        <code className="mt-1 block break-all font-mono text-xs text-primary">POST {endpoint}</code>
        <p className="mt-1 text-xs text-muted-foreground">Envie a chave no cabeçalho <span className="font-mono">Authorization: Bearer &lt;chave&gt;</span>. Nunca coloque a chave na URL.</p>
      </div>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground"><tr className="border-b">
            <th className="p-3">Nome</th><th className="p-3">Chave</th><th className="p-3">Servidor</th><th className="p-3">Status</th><th className="p-3">Expira</th><th className="p-3">Último uso</th><th className="p-3" />
          </tr></thead>
          <tbody>
            {keys?.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Nenhuma chave criada ainda.</td></tr>}
            {keys?.map((k) => { const s = status(k); return (
              <tr key={k.id} className="border-b last:border-0">
                <td className="p-3"><button className="text-left hover:underline" onClick={() => setSelected(selected === k.id ? null : k.id)}>{k.name}</button>{k.description && <div className="text-xs text-muted-foreground">{k.description}</div>}</td>
                <td className="p-3 font-mono text-xs">{k.key_prefix}…</td>
                <td className="p-3">{host(k.server_id)}</td>
                <td className={`p-3 font-medium ${s.cls}`}>{s.label}</td>
                <td className="p-3 text-xs">{k.expires_at ? fmtDate(k.expires_at) : "Nunca"}</td>
                <td className="p-3 text-xs">{k.last_used_at ? fmtDate(k.last_used_at) : "—"}</td>
                <td className="p-3 text-right whitespace-nowrap">
                  {!k.revoked_at && <>
                    <Button size="sm" variant="ghost" onClick={() => openNew(k)} title="Rotacionar"><RotateCw className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => revoke(k)} title="Revogar"><ShieldOff className="h-4 w-4" /></Button>
                  </>}
                </td>
              </tr>); })}
          </tbody>
        </table>
      </div>
      {selected && (
        <div className="mt-4 rounded-lg border bg-card p-4">
          <h3 className="font-semibold">Histórico de uso (últimas 50 chamadas)</h3>
          {usage?.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">Esta chave ainda não foi usada.</p> : (
            <ul className="mt-2 space-y-1 font-mono text-xs">
              {usage?.map((u) => <li key={u.id}>{fmtDate(u.created_at)} · {u.endpoint} · <span className={u.status_code >= 400 ? "text-destructive" : "text-primary"}>{u.status_code}</span> · {u.events} eventos{u.error ? ` · ${u.error}` : ""}</li>)}
            </ul>)}
        </div>
      )}
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSecret(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{rotate ? "Rotacionar chave" : "Nova chave de API"}</DialogTitle></DialogHeader>
          {secret ? (
            <div className="space-y-3">
              <p className="text-sm">Copie a chave agora. Ela <strong>não será exibida novamente</strong>.{rotate && " A chave anterior foi revogada."}</p>
              <div className="flex gap-2"><code className="flex-1 break-all rounded border bg-muted p-2 font-mono text-xs">{secret}</code>
                <Button size="icon" variant="outline" onClick={() => { navigator.clipboard.writeText(secret); toast.success("Copiada"); }}><Copy className="h-4 w-4" /></Button></div>
              <Button variant="outline" onClick={() => sendTest(secret)}>Enviar evento de teste</Button>
              {testResult && <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded border bg-muted p-2 font-mono text-xs">{testResult}</pre>}
              <DialogFooter><Button onClick={() => { setOpen(false); setSecret(null); }}>Concluir</Button></DialogFooter>
            </div>
          ) : (
            <div className="space-y-3">
              <div><Label>Nome</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Coletor WIN-PROD-01" /></div>
              <div><Label>Descrição</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
              <div><Label>Servidor vinculado</Label>
                <select className="mt-1 w-full rounded-md border bg-background p-2 text-sm" value={form.serverId} onChange={(e) => setForm({ ...form, serverId: e.target.value })}>
                  <option value="">Qualquer servidor da organização</option>
                  {servers?.map((s) => <option key={s.id} value={s.id}>{s.hostname}</option>)}
                </select></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Expira em</Label>
                  <select className="mt-1 w-full rounded-md border bg-background p-2 text-sm" value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })}>
                    <option value="30">30 dias</option><option value="90">90 dias</option><option value="365">1 ano</option><option value="0">Nunca</option>
                  </select></div>
                <div><Label>Limite por minuto</Label><Input type="number" min={1} max={10000} value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} /></div>
              </div>
              <p className="text-xs text-muted-foreground">Escopo: <span className="font-mono">logs:ingest</span></p>
              <DialogFooter><Button disabled={busy || !form.name.trim()} onClick={submit}><KeyRound className="mr-1 h-4 w-4" />{rotate ? "Gerar nova chave" : "Criar chave"}</Button></DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
