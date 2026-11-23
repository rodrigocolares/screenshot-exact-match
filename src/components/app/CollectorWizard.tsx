import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, Network, Plus, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { saveCollector } from "@/lib/api/collectors.functions";
import { SOURCE_OPTIONS, generateConfig, MULTILINE_CONFIG, type Source } from "@/lib/collectors/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { collectorsQuery } from "@/lib/collectors/queries";

export function downloadText(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}
const ENV = { production: "Produção", staging: "Homologação", development: "Desenvolvimento" };

export function CollectorWizard({ orgId, open, onClose }: { orgId: string; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const save = useServerFn(saveCollector);
  const [step, setStep] = useState(1);
  const [os, setOs] = useState("linux");
  const [serverId, setServerId] = useState("");
  const [hostname, setHostname] = useState("");
  const [environment, setEnvironment] = useState("production");
  const [name, setName] = useState("");
  const [keyId, setKeyId] = useState("");
  const [secret, setSecret] = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [endpoint, setEndpoint] = useState("https://pixel-perfect-recreation-2056.lovable.app/api/public/v1/logs/ingest");
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const [realLine, setRealLine] = useState("");
  const { data: servers = [] } = useQuery({ queryKey: ["collector-servers", orgId], queryFn: async () => { const r = await supabase.from("servers").select("id,hostname,os,environment").eq("org_id", orgId).order("hostname"); if (r.error) throw r.error; return r.data; } });
  const { data: keys = [] } = useQuery({ queryKey: ["collector-keys", orgId], queryFn: async () => { const r = await supabase.from("ingestion_api_keys").select("id,name,server_id,expires_at,revoked_at").eq("org_id", orgId); if (r.error) throw r.error; return r.data; } });
  const selectedServer = servers.find(s => s.id === serverId);
  const host = selectedServer?.hostname ?? hostname;
  const validKeys = keys.filter(k => !k.revoked_at && (!k.expires_at || Date.parse(k.expires_at) > Date.now()) && (!k.server_id || k.server_id === serverId));
  async function register() {
    setBusy(true);
    try {
      let id = serverId;
      if (!id) {
        if (!/^[A-Za-z0-9._-]{1,255}$/.test(hostname)) throw new Error("Hostname inválido");
        const { data, error } = await supabase.from("servers").insert({ org_id: orgId, hostname, os, environment }).select("id").single();
        if (error || !data) throw new Error(error?.message ?? "Falha no cadastro");
        id = data.id; setServerId(id);
        await qc.invalidateQueries({ queryKey: ["collector-servers", orgId] });
      }
      const response = await save({ data: { orgId, serverId: id, apiKeyId: keyId, name: name || host, version: "5.0.7", sources } });
      setSavedId(response.id); setStep(3);
      await qc.invalidateQueries({ queryKey: ["collectors", orgId] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao configurar coletor"); }
    setBusy(false);
  }
  async function verifyEndpoint() {
    if (!savedId || !sources[0]) return;
    setBusy(true); setVerified(false);
    try {
      const url = new URL(endpoint);
      if (url.protocol !== "https:" || !/^\/api\/(public\/)?v1\/logs\/(ingest|batch)$/.test(url.pathname) || url.search || url.username || url.password) throw new Error("Informe um endpoint HTTPS válido, sem credenciais na URL");
      // A signed empty batch verifies routing + credential + association, but writes no event/heartbeat.
      const response = await fetch(url.href, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${secret}` }, body: JSON.stringify({ collector_id: savedId, source_id: sources[0].id, hostname: host, operating_system: os, source_type: sources[0].type, events: [] }) });
      const body = await response.json();
      if (response.status !== 400 || body.error !== "invalid_payload") throw new Error(`HTTP ${response.status}: URL, chave ou associação não confirmada`);
      setVerified(true); setResult("URL e credencial confirmadas. Nenhum evento ou heartbeat foi criado.");
    } catch (e) { setResult(e instanceof Error ? e.message : "Não foi possível confirmar o endereço. Confira a publicação e a conexão."); }
    setBusy(false);
  }
  async function sendRealLine() {
    const source = sources[0];
    if (!source || !savedId) return;
    setBusy(true);
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${secret}` }, body: JSON.stringify({ collector_id: savedId, source_id: source.id, hostname: host, operating_system: os, source_type: source.type, events: [{ ...(source.type === "generic" ? { message: realLine } : { raw: realLine }) }] }) });
      const body = await response.json();
      if (response.status !== 202 || body.accepted !== 1) throw new Error(`HTTP ${response.status} — aceitos: ${body.accepted ?? 0}, rejeitados: ${body.rejected ?? 0}`);
      const { data, error } = await supabase.from("log_events").select("id").eq("org_id", orgId).contains("attributes", { ingest_batch_id: body.batch_id }).limit(1);
      if (error || !data?.length) throw new Error("Resposta recebida, mas evento ainda não confirmado na organização");
      await qc.fetchQuery(collectorsQuery(orgId));
      setResult("Evento persistido e confirmado na organização. Envio manual; a coleta automática ainda depende do agente instalado.");
    } catch (e) { setResult(e instanceof Error ? e.message : "Falha no envio"); }
    setBusy(false);
  }
  function downloadSettings() {
    if (!savedId || !verified) return;
    downloadText("collector.json", JSON.stringify({ collector_id: savedId, hostname: host, operating_system: os, version: "5.0.7", endpoint, sources }, null, 2));
  }
  return <Dialog open={open} onOpenChange={v => { if (!v) { setSecret(""); onClose(); } }}><DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>Adicionar Coletor · {step}/3</DialogTitle></DialogHeader>
    {step === 1 && <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2"><div><Label>Nome do coletor</Label><Input aria-label="Nome do coletor" value={name} onChange={e => setName(e.target.value)} /></div><div><Label>Sistema operacional</Label><Select value={os} onValueChange={v => { setOs(v); setServerId(""); setSources([]); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="linux">Linux</SelectItem><SelectItem value="windows">Windows</SelectItem></SelectContent></Select></div></div>
      <Label>Servidor</Label><Select value={serverId || "new"} onValueChange={v => { setServerId(v === "new" ? "" : v); setKeyId(""); const s = servers.find(x => x.id === v); if (s) setEnvironment(s.environment); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="new">Cadastrar novo servidor</SelectItem>{servers.filter(s => s.os === os).map(s => <SelectItem key={s.id} value={s.id}>{s.hostname}</SelectItem>)}</SelectContent></Select>
      {!serverId && <div><Label>Hostname</Label><Input aria-label="Hostname" value={hostname} onChange={e => setHostname(e.target.value)} /></div>}
      <Label>Ambiente</Label><Select disabled={!!serverId} value={environment} onValueChange={setEnvironment}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(ENV).map(([v, label]) => <SelectItem key={v} value={v}>{label}</SelectItem>)}</SelectContent></Select>
      <div className="flex justify-end"><Button disabled={!host.trim()} onClick={() => setStep(2)}>Continuar</Button></div>
    </div>}
    {step === 2 && <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Fluent Bit 5.0.7 · {host} · {ENV[environment as keyof typeof ENV]}</p>
      <Label>Fontes monitoradas</Label><Select value="" onValueChange={v => { const option = SOURCE_OPTIONS.find(s => s.value === v); if (option) setSources([...sources, { id: crypto.randomUUID(), type: option.value, path: os === "windows" && option.os === "any" ? "C:/logs/application.log" : option.path }]); }}><SelectTrigger><SelectValue placeholder="Adicionar fonte" /></SelectTrigger><SelectContent>{SOURCE_OPTIONS.filter(s => s.os === "any" || s.os === os).map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent></Select>
      {sources.map((s, i) => <div key={s.id} className="flex items-end gap-2"><div className="min-w-0 flex-1"><Label>{SOURCE_OPTIONS.find(o => o.value === s.type)?.label}</Label><Input aria-label={`Caminho da fonte ${i + 1}`} value={s.path} onChange={e => setSources(sources.map(x => x.id === s.id ? { ...x, path: e.target.value } : x))} /></div><Button variant="ghost" size="icon" title="Remover fonte" onClick={() => setSources(sources.filter(x => x.id !== s.id))}><Trash2 /></Button></div>)}
      <Label>Chave de API válida</Label><Select value={keyId} onValueChange={setKeyId}><SelectTrigger><SelectValue placeholder="Selecionar chave" /></SelectTrigger><SelectContent>{validKeys.map(k => <SelectItem key={k.id} value={k.id}>{k.name}</SelectItem>)}</SelectContent></Select>
      {!validKeys.length && <p className="text-sm text-sev-warn">Crie uma chave em Administração → Chaves de API antes de continuar.</p>}
      <div className="flex justify-between"><Button variant="outline" onClick={() => setStep(1)}>Voltar</Button><Button disabled={busy || !sources.length || !keyId} onClick={register}><Plus />Salvar coletor</Button></div>
    </div>}
    {step === 3 && savedId && <div className="space-y-4">
      <div><Label>URL HTTPS publicada</Label><Input aria-label="URL HTTPS publicada" value={endpoint} onChange={e => { setEndpoint(e.target.value); setVerified(false); }} /></div>
      <div><Label>Chave completa para verificar o endereço</Label><Input aria-label="Chave completa" type="password" autoComplete="off" value={secret} onChange={e => { setSecret(e.target.value); setVerified(false); }} /></div>
      <Button variant="outline" disabled={!secret || busy} onClick={verifyEndpoint}><Network />Verificar URL e chave</Button>
      <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={!verified} onClick={() => downloadText("fluent-bit.conf", generateConfig({ id: savedId, version: "5.0.7", sources }, os))}><Download />Fluent Bit</Button><Button variant="outline" disabled={!verified} onClick={() => downloadText("multiline.conf", MULTILINE_CONFIG)}><Download />Multilinha</Button><Button variant="outline" disabled={!verified} onClick={downloadSettings}><Download />collector.json</Button><Button asChild variant="outline"><a href="/collectors/bridge.py" download><Download />Adaptador Python</a></Button><Button asChild variant="outline"><a href="/collectors/INSTALL.md" download><Download />Instalação</a></Button></div>
      <p className="text-xs text-muted-foreground">Credenciais não são incluídas nos arquivos. Configure LOGSENTINEL_API_KEY no servidor. A verificação acima não confirma um agente remoto.</p>
      <Label>Linha real de log — primeira fonte ({sources[0]?.type})</Label><textarea aria-label="Linha real de log" className="min-h-24 w-full rounded-md border bg-background p-3 font-mono text-xs" value={realLine} onChange={e => setRealLine(e.target.value)} />
      <Button variant="outline" disabled={!verified || !realLine || busy || sources[0]?.type === "windows_event" || sources[0]?.type === "journald"} onClick={sendRealLine}><Send />Enviar linha real</Button>
      {result && <p role="status" className="break-words border-l-2 border-primary pl-3 text-sm">{result}</p>}
      <div className="flex justify-end"><Button onClick={() => { setSecret(""); onClose(); }}>Concluir</Button></div>
    </div>}
  </DialogContent></Dialog>;
}