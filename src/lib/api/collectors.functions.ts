import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { collectorSchema, SOURCE_OPTIONS, sourceSchema, isCollectorEndpoint } from "@/lib/collectors/core";
import { z } from "zod";
import { authorizeKey, sha256Hex } from "@/lib/ingest/core";

export const saveCollector = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => collectorSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: admin } = await context.supabase.rpc("is_org_admin", { _org: data.orgId });
    if (!admin) throw new Error("Somente administradores podem configurar coletores");
    const { data: server } = await context.supabase.from("servers").select("id,os").eq("org_id", data.orgId).eq("id", data.serverId).single();
    if (!server) throw new Error("Servidor não autorizado");
    if (data.sources.some(s => { const option = SOURCE_OPTIONS.find(o => o.value === s.type); return option && option.os !== "any" && option.os !== server.os; })) throw new Error("Fonte incompatível com o sistema operacional");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const values = { org_id: data.orgId, server_id: data.serverId, api_key_id: data.apiKeyId, name: data.name, version: data.version, sources: data.sources, created_by: context.userId };
    const result = data.id
      ? await supabaseAdmin.from("collectors").update(values).eq("id", data.id).eq("org_id", data.orgId).select("id").single()
      : await supabaseAdmin.from("collectors").insert(values).select("id").single();
    if (result.error || !result.data) throw new Error("Não foi possível salvar: confira servidor, validade e associação da chave");
    const { error } = await supabaseAdmin.from("collector_audit").insert({ org_id: data.orgId, collector_id: result.data.id, actor_id: context.userId, action: data.id ? "configuration_updated" : "collector_created" });
    if (error) throw new Error("Configuração salva, mas houve falha no registro de auditoria");
    return result.data;
  });

const testSchema = z.object({ orgId: z.string().uuid(), collectorId: z.string().uuid(), endpoint: z.string().max(500).refine(isCollectorEndpoint, "Use uma URL HTTPS deste projeto"), key: z.string().regex(/^lsk_[A-Za-z0-9_-]{40,60}$/), line: z.string().max(32000).optional() });
export const testCollectorEndpoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => testSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: admin } = await context.supabase.rpc("is_org_admin", { _org: data.orgId });
    if (!admin) throw new Error("Somente administradores podem testar credenciais");
    const { data: collector } = await context.supabase.from("collectors").select("api_key_id,sources,servers(hostname,os)").eq("id", data.collectorId).eq("org_id", data.orgId).single();
    if (!collector?.servers) throw new Error("Coletor não autorizado");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: key } = await supabaseAdmin.from("ingestion_api_keys").select("id,revoked_at,expires_at,scopes").eq("id", collector.api_key_id).eq("org_id", data.orgId).eq("key_hash", await sha256Hex(data.key)).maybeSingle();
    const decision = authorizeKey(key, "logs:ingest");
    if (!decision.ok) throw new Error("Chave inválida, expirada, revogada ou não associada ao coletor");
    const source = sourceSchema.parse(Array.isArray(collector.sources) ? collector.sources[0] : null);
    const response = await fetch(data.endpoint, { method: "POST", redirect: "manual", headers: { "content-type": "application/json", authorization: `Bearer ${data.key}` }, body: JSON.stringify({ collector_id: data.collectorId, source_id: source.id, hostname: collector.servers.hostname, operating_system: collector.servers.os, source_type: source.type, events: data.line ? [{ ...(source.type === "generic" ? { message: data.line } : { raw: data.line }) }] : [] }) });
    const parsed = z.object({ error: z.string().optional(), accepted: z.number().optional(), rejected: z.number().optional(), batch_id: z.string().uuid().optional() }).safeParse(await response.json().catch(() => null));
    if (!parsed.success) throw new Error(`HTTP ${response.status}: endereço não confirmado`);
    return { status: response.status, ...parsed.data };
  });