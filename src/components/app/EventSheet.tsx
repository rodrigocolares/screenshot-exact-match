import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { BrainCircuit, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { SeverityBadge } from "./SeverityBadge";
import { investigateEvent } from "@/server/ai.functions";
import { fmtDate, SOURCE_LABEL } from "@/lib/logs/meta";
import type { Tables } from "@/integrations/supabase/types";

export type LogEvent = Tables<"log_events">;

function Markdown({ text }: { text: string }) {
  return (
    <div className="space-y-1.5 text-sm leading-relaxed">
      {text.split("\n").map((l, i) => {
        if (l.startsWith("## ")) return <h4 key={i} className="pt-3 font-display text-sm font-semibold text-primary">{l.slice(3)}</h4>;
        if (l.startsWith("# ")) return <h3 key={i} className="pt-3 font-semibold">{l.slice(2)}</h3>;
        if (/^\s*[-*] /.test(l)) return <div key={i} className="flex gap-2 pl-1"><span className="text-primary">•</span><span dangerouslySetInnerHTML={{ __html: inline(l.replace(/^\s*[-*] /, "")) }} /></div>;
        if (!l.trim()) return null;
        return <p key={i} dangerouslySetInnerHTML={{ __html: inline(l) }} />;
      })}
    </div>
  );
}
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const inline = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`([^`]+)`/g, '<code class="rounded bg-muted px-1 font-mono text-xs">$1</code>');

export function EventSheet({ event, onOpenChange }: { event: LogEvent | null; onOpenChange: (o: boolean) => void }) {
  const investigate = useServerFn(investigateEvent);
  const [analysis, setAnalysis] = useState<{ id: string; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function run() {
    if (!event) return;
    setLoading(true);
    try {
      const r = await investigate({ data: { eventId: event.id } });
      setAnalysis({ id: event.id, text: r.content });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na análise");
    } finally {
      setLoading(false);
    }
  }

  const fields: [string, unknown][] = event
    ? [
        ["Timestamp", fmtDate(event.timestamp)], ["Observado em", fmtDate(event.observed_timestamp)], ["Hostname", event.hostname],
        ["Sistema", event.operating_system], ["Origem", SOURCE_LABEL[event.source_type] ?? event.source_type], ["Serviço", event.service_name],
        ["Ambiente", event.environment], ["Categoria", event.event_category], ["IP cliente", event.client_ip], ["Usuário", event.username],
        ["Método", event.http_method], ["Status HTTP", event.http_status], ["Caminho", event.request_path],
        ["Tempo de resposta (ms)", event.response_time], ["User-Agent", event.user_agent],
      ]
    : [];

  return (
    <Sheet open={!!event} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        {event && (
          <>
            <SheetHeader>
              <div className="flex items-center gap-2">
                <SeverityBadge severity={event.severity} />
                {event.is_demo && <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">fictício</span>}
              </div>
              <SheetTitle className="text-left font-mono text-sm leading-relaxed">{event.message}</SheetTitle>
            </SheetHeader>
            <div className="px-4 pb-6">
              <Button onClick={run} disabled={loading} className="mb-4 w-full">
                {loading ? <Loader2 className="animate-spin" /> : <BrainCircuit />} Investigar com IA
              </Button>
              {analysis?.id === event.id && (
                <div className="mb-5 rounded-lg border border-primary/40 bg-primary/5 p-4">
                  <Markdown text={analysis.text} />
                  <p className="mt-3 text-[11px] text-muted-foreground">Análise gerada por IA — valide antes de agir.</p>
                </div>
              )}
              <Tabs defaultValue="norm">
                <TabsList><TabsTrigger value="norm">Normalizado</TabsTrigger><TabsTrigger value="raw">Bruto</TabsTrigger><TabsTrigger value="attr">Atributos</TabsTrigger></TabsList>
                <TabsContent value="norm">
                  <dl className="grid grid-cols-[160px_1fr] gap-x-3 gap-y-1.5 text-sm">
                    {fields.map(([k, v]) => (
                      <div key={k} className="contents">
                        <dt className="text-muted-foreground">{k}</dt>
                        <dd className="break-all font-mono text-xs leading-5">{v === null || v === undefined || v === "" ? <span className="text-muted-foreground/60">null</span> : String(v)}</dd>
                      </div>
                    ))}
                  </dl>
                </TabsContent>
                <TabsContent value="raw"><pre className="whitespace-pre-wrap break-all rounded bg-sidebar p-3 font-mono text-xs">{event.raw_message}</pre></TabsContent>
                <TabsContent value="attr"><pre className="whitespace-pre-wrap break-all rounded bg-sidebar p-3 font-mono text-xs">{JSON.stringify(event.attributes, null, 2)}</pre></TabsContent>
              </Tabs>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
