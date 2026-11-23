import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { collectorSchema, SOURCE_OPTIONS } from "@/lib/collectors/core";

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