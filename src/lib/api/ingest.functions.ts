import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseLogs, type LogType } from "@/lib/logs/parsers";

const MAX_BYTES = 5 * 1024 * 1024;

async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const schema = z.object({
  orgId: z.string().uuid(),
  serverId: z.string().uuid().nullable(),
  logType: z.string().max(40),
  fileName: z.string().min(1).max(255),
  content: z.string().max(MAX_BYTES, "Arquivo excede 5 MB"),
});

export const ingestLogFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof schema>) => schema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let server: { id: string; hostname: string; os: string; environment: string } | null = null;
    if (data.serverId) {
      const { data: s, error } = await supabase
        .from("servers")
        .select("id, hostname, os, environment")
        .eq("id", data.serverId)
        .eq("org_id", data.orgId)
        .single();
      if (error || !s) throw new Error("Servidor não encontrado");
      server = s;
    }

    const fileHash = await sha256(data.content);
    const parsed = parseLogs(data.content, data.logType as LogType);

    const { data: job, error: jobErr } = await supabase
      .from("ingestion_jobs")
      .insert({
        org_id: data.orgId,
        server_id: server?.id ?? null,
        file_name: data.fileName,
        log_type: parsed.detected,
        file_hash: fileHash,
        status: "processing",
        lines_total: parsed.total,
        created_by: userId,
      })
      .select("id")
      .single();
    if (jobErr || !job) throw new Error(jobErr?.message ?? "Falha ao criar job");

    const rows = await Promise.all(
      parsed.events.map(async (e) => ({
        org_id: data.orgId,
        server_id: server?.id ?? null,
        job_id: job.id,
        timestamp: e.timestamp,
        operating_system: server?.os ?? null,
        hostname: server?.hostname ?? (typeof e.attributes["syslog_host"] === "string" ? e.attributes["syslog_host"] : null),
        source_type: e.source_type,
        service_name: e.service_name,
        environment: server?.environment ?? null,
        severity: e.severity,
        event_category: e.event_category,
        message: e.message.slice(0, 8000),
        raw_message: e.raw_message.slice(0, 32000),
        client_ip: e.client_ip,
        username: e.username,
        http_method: e.http_method,
        http_status: e.http_status,
        request_path: e.request_path?.slice(0, 2000) ?? null,
        response_time: e.response_time,
        user_agent: e.user_agent,
        attributes: e.attributes as never,
        dedup_hash: await sha256(`${server?.id ?? "-"}|${e.source_type}|${e.raw_message}`),
      })),
    );

    let imported = 0;
    const insertErrors: string[] = [];
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { data: ins, error } = await supabase
        .from("log_events")
        .upsert(chunk, { onConflict: "org_id,dedup_hash", ignoreDuplicates: true })
        .select("id");
      if (error) insertErrors.push(error.message);
      else imported += ins?.length ?? 0;
    }
    const duplicated = insertErrors.length ? 0 : rows.length - imported;

    const status = insertErrors.length ? "failed" : parsed.rejected.length ? "completed_with_errors" : "completed";
    await supabase
      .from("ingestion_jobs")
      .update({
        status,
        lines_imported: imported,
        lines_rejected: parsed.rejected.length,
        lines_duplicated: Math.max(0, duplicated),
        errors: [...insertErrors.map((m) => ({ reason: m })), ...parsed.rejected.slice(0, 100)] as never,
      })
      .eq("id", job.id);

    if (server) await supabase.from("servers").update({ last_seen_at: new Date().toISOString() }).eq("id", server.id);
    const { data: alerts } = await supabase.rpc("evaluate_alerts", { _org: data.orgId });

    return {
      jobId: job.id,
      detected: parsed.detected,
      total: parsed.total,
      imported,
      rejected: parsed.rejected.length,
      duplicated: Math.max(0, duplicated),
      alertsCreated: alerts ?? 0,
      status,
      sampleRejected: parsed.rejected.slice(0, 10),
    };
  });
