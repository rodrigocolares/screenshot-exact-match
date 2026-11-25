import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Monitor, Plus, Terminal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmtDate } from "@/lib/logs/meta";

export const Route = createFileRoute("/_authenticated/servers")({
  head: () => ({ meta: [{ title: "Servidores — LogSentinel AI" }, { name: "description", content: "Inventário de servidores monitorados." }, { property: "og:title", content: "Servidores — LogSentinel AI" }, { property: "og:description", content: "Inventário de servidores monitorados." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: Servers,
});

const ENV: Record<string, string> = { production: "Produção", staging: "Homologação", development: "Desenvolvimento" };
const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

function Servers() {
  const { data: org } = useOrg();
  const qc = useQueryClient();
  const { data: servers } = useQuery({
    queryKey: ["servers", org?.orgId],
    enabled: !!org,
    queryFn: async () => (await supabase.from("servers").select("*").eq("org_id", org!.orgId).order("hostname")).data ?? [],
  });

  async function remove(id: string, host: string) {
    if (!confirm(`Remover ${host}? Os eventos já recebidos serão mantidos.`)) return;
    const { error } = await supabase.from("servers").delete().eq("id", id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["servers"] });
  }

  return (
    <div>
      <PageHeader title="Servidores" description="Inventário de servidores, aplicações e serviços monitorados." actions={<NewServer />} />
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr><th className="px-3 py-2">Hostname</th><th className="px-3 py-2">SO</th><th className="px-3 py-2">Endereço</th><th className="px-3 py-2">Ambiente</th><th className="px-3 py-2">Serviços</th><th className="px-3 py-2">Responsável</th><th className="px-3 py-2">Última comunicação</th><th /></tr>
          </thead>
          <tbody>
            {servers?.map((s) => {
              const stale = !s.last_seen_at || Date.now() - new Date(s.last_seen_at).getTime() > 3600e3;
              return (
                <tr key={s.id} className="border-b border-border/50">
                  <td className="px-3 py-2 font-mono">
                    <Link to="/explorer" search={{ host: s.hostname }} className="hover:text-primary">{s.hostname}</Link>
                    {s.is_demo && <span className="ml-2 rounded bg-muted px-1 text-[10px] uppercase text-muted-foreground">fictício</span>}
                  </td>
                  <td className="px-3 py-2"><span className="inline-flex items-center gap-1.5">{s.os === "windows" ? <Monitor className="size-3.5 text-sev-info" /> : <Terminal className="size-3.5 text-success" />}{s.os_version ?? s.os}</span></td>
                  <td className="px-3 py-2 font-mono text-xs">{s.address ?? "—"}</td>
                  <td className="px-3 py-2">{ENV[s.environment]}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{s.services.join(", ") || "—"}</td>
                  <td className="px-3 py-2 text-xs">{s.owner ?? "—"}</td>
                  <td className={`px-3 py-2 text-xs ${stale ? "text-sev-warn" : "text-success"}`}>{fmtDate(s.last_seen_at)}</td>
                  <td className="px-3 py-2 text-right"><Button size="icon" variant="ghost" onClick={() => remove(s.id, s.hostname)}><Trash2 /></Button></td>
                </tr>
              );
            })}
            {servers && !servers.length && <tr><td colSpan={8} className="px-3 py-12 text-center text-muted-foreground">Nenhum servidor cadastrado.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function NewServer() {
  const { data: org } = useOrg();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ hostname: "", os: "linux", os_version: "", address: "", environment: "production", owner: "", services: "", applications: "", tags: "" });
  const up = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("servers").insert({
      org_id: org!.orgId, hostname: f.hostname.trim(), os: f.os, os_version: f.os_version || null, address: f.address || null,
      environment: f.environment, owner: f.owner || null, services: list(f.services), applications: list(f.applications), tags: list(f.tags),
    });
    if (error) { toast.error(error.code === "23505" ? "Já existe um servidor com esse hostname" : error.message); return; }
    toast.success("Servidor cadastrado");
    qc.invalidateQueries({ queryKey: ["servers"] });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus /> Novo servidor</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Cadastrar servidor</DialogTitle></DialogHeader>
        <form onSubmit={save} className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5"><Label>Hostname</Label><Input required value={f.hostname} onChange={up("hostname")} placeholder="LINUX-PROD-01" /></div>
          <div className="space-y-1.5"><Label>Sistema</Label>
            <Select value={f.os} onValueChange={(v) => setF({ ...f, os: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="windows">Windows</SelectItem><SelectItem value="linux">Linux</SelectItem></SelectContent></Select>
          </div>
          <div className="space-y-1.5"><Label>Versão</Label><Input value={f.os_version} onChange={up("os_version")} placeholder="Ubuntu 22.04" /></div>
          <div className="space-y-1.5"><Label>IP / DNS</Label><Input value={f.address} onChange={up("address")} /></div>
          <div className="space-y-1.5"><Label>Ambiente</Label>
            <Select value={f.environment} onValueChange={(v) => setF({ ...f, environment: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(ENV).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="col-span-2 space-y-1.5"><Label>Serviços (separados por vírgula)</Label><Input value={f.services} onChange={up("services")} placeholder="Nginx, Java Spring Boot, SSH" /></div>
          <div className="space-y-1.5"><Label>Aplicações</Label><Input value={f.applications} onChange={up("applications")} /></div>
          <div className="space-y-1.5"><Label>Tags</Label><Input value={f.tags} onChange={up("tags")} /></div>
          <div className="col-span-2 space-y-1.5"><Label>Responsável técnico</Label><Input value={f.owner} onChange={up("owner")} /></div>
          <DialogFooter className="col-span-2"><Button type="submit">Salvar</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
