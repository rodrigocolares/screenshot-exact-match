import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { displayPrefix, generateApiKey, sha256Hex } from "@/lib/ingest/core";

const createSchema = z.object({
  orgId: z.string().uuid(),
  name: z.string().trim().min(1).max(100),
  description: z.string().max(500).optional(),
  serverId: z.string().uuid().nullable(),
  expiresAt: z.string().datetime().nullable(),
  rateLimit: z.number().int().min(1).max(10000),
  rotateFrom: z.string().uuid().optional(),
});

// RLS (is_org_admin) enforces that only org admins can create/revoke keys.
export const createApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof createSchema>) => createSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: admin } = await supabase.rpc("is_org_admin", { _org: data.orgId });
    if (!admin) throw new Error("Apenas administradores podem gerenciar chaves");
    const key = generateApiKey();
    const { data: row, error } = await supabase.from("ingestion_api_keys").insert({
      org_id: data.orgId, name: data.name, description: data.description ?? null, server_id: data.serverId,
      expires_at: data.expiresAt, rate_limit_per_minute: data.rateLimit, key_prefix: displayPrefix(key),
      key_hash: await sha256Hex(key), created_by: userId, rotated_from: data.rotateFrom ?? null,
    }).select("id").single();
    if (error || !row) throw new Error(error?.message ?? "Falha ao criar chave");
    if (data.rotateFrom) {
      await supabase.from("ingestion_api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", data.rotateFrom).eq("org_id", data.orgId);
    }
    return { id: row.id, key };
  });
