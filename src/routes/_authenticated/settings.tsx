import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { FlaskConical, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Configurações — LogSentinel AI" }, { name: "description", content: "Organização, dados de demonstração e coletores." }, { property: "og:title", content: "Configurações — LogSentinel AI" }, { property: "og:description", content: "Organização, dados de demonstração e coletores." }] }),
  component: Settings,
});

const FLUENT_LINUX = `[SERVICE]
    Flush        5
    storage.path /var/lib/fluent-bit/buffer

[INPUT]
    Name   tail
    Path   /var/log/nginx/access.log,/var/log/nginx/error.log
    Tag    nginx.*
    storage.type filesystem

[INPUT]
    Name   tail
    Path   /var/log/auth.log
    Tag    linux_auth

[OUTPUT]
    Name   file
    Match  *
    Path   /var/log/logsentinel-export/
# Envie os arquivos gerados pela tela "Ingestão de logs".
# A API de ingestão contínua chega na Fase 2.`;

const FLUENT_WIN = `[INPUT]
    Name         winevtlog
    Channels     Application,System,Security
    Interval_Sec 5

[INPUT]
    Name  tail
    Path  C:\\inetpub\\logs\\LogFiles\\W3SVC1\\*.log
    Tag   iis_access

[OUTPUT]
    Name   file
    Match  *
    Path   C:\\logsentinel-export\\`;

function Settings() {
  const { data: org } = useOrg();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const canWrite = org?.role !== "viewer";

  async function demo(load: boolean) {
    setBusy(load ? "load" : "clear");
    const { data, error } = load
      ? await supabase.rpc("load_demo_data", { _org: org!.orgId })
      : await supabase.rpc("clear_demo_data", { _org: org!.orgId });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success(load ? `${data} eventos fictícios carregados` : "Dados de demonstração removidos");
    qc.invalidateQueries();
  }

  return (
    <div>
      <PageHeader title="Configurações" description="Organização, ambiente de demonstração e coletores." />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border bg-card p-5">
          <h3 className="font-semibold">Organização</h3>
          <dl className="mt-3 grid grid-cols-[120px_1fr] gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">Nome</dt><dd>{org?.orgName}</dd>
            <dt className="text-muted-foreground">Seu papel</dt><dd className="font-mono uppercase">{org?.role}</dd>
            <dt className="text-muted-foreground">Usuário</dt><dd>{org?.email}</dd>
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">Os dados de cada organização ficam isolados das demais.</p>
        </div>
        <div className="rounded-lg border border-primary/40 bg-card p-5">
          <h3 className="flex items-center gap-2 font-semibold"><FlaskConical className="size-4 text-primary" /> Modo demonstração</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Gera cerca de 1.800 eventos <b>fictícios</b> dos últimos 7 dias (IIS 500/404, falha de serviço Windows, FTP, Apache 403, Nginx timeout, Java NullPointerException, SSH, vsftpd) em 5 servidores DEMO-*. Ficam marcados como fictícios e podem ser removidos sem afetar dados reais.
          </p>
          <div className="mt-4 flex gap-2">
            <Button disabled={!canWrite || !!busy} onClick={() => demo(true)}>{busy === "load" && <Loader2 className="animate-spin" />} Carregar dados fictícios</Button>
            <Button variant="outline" disabled={!canWrite || !!busy} onClick={() => demo(false)}>{busy === "clear" ? <Loader2 className="animate-spin" /> : <Trash2 />} Remover</Button>
          </div>
        </div>
        <div className="rounded-lg border bg-card p-5 lg:col-span-2">
          <h3 className="font-semibold">Coletores (Fluent Bit)</h3>
          <p className="mt-1 text-sm text-muted-foreground">Exemplos de configuração para preparar a coleta nos servidores. No MVP, os arquivos coletados são enviados pela tela de ingestão; a API contínua com chaves por fonte está prevista para a próxima fase.</p>
          <Tabs defaultValue="linux" className="mt-3">
            <TabsList><TabsTrigger value="linux">Linux</TabsTrigger><TabsTrigger value="win">Windows</TabsTrigger></TabsList>
            <TabsContent value="linux"><pre className="overflow-x-auto rounded bg-sidebar p-4 font-mono text-xs">{FLUENT_LINUX}</pre></TabsContent>
            <TabsContent value="win"><pre className="overflow-x-auto rounded bg-sidebar p-4 font-mono text-xs">{FLUENT_WIN}</pre></TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
