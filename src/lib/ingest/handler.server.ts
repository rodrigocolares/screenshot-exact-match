import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authorizeKey, batchSchema, heartbeatSchema, dedupInput, eventSchema, extractBearer, isRateLimited, MAX_BODY_BYTES, normalizeEvent, sha256Hex } from "./core";
import { sourceSchema } from "@/lib/collectors/core";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export async function handleIngest(request: Request, endpoint: string): Promise<Response> {
  let keyId: string | null = null;
  let orgId: string | null = null;
  let collectorId: string | null = null;
  async function audit(k: string | null, o: string | null, path: string, status: number, events: number, error?: string) {
    await supabaseAdmin.from("ingestion_api_requests").insert({ api_key_id: k, org_id: o, collector_id: collectorId, endpoint: path, status_code: status, events, error: error ?? null });
    if (collectorId && error && error !== "batch_replay") await supabaseAdmin.rpc("record_collector_delivery", { _id: collectorId, _accepted: 0, _event_at: new Date().toISOString(), _heartbeat: false, _status: status, _error: error });
  }
  try {
    const token = extractBearer(request.headers.get("authorization"));
    if (!token) return json(401, { error: "missing_or_malformed_api_key" });
    const { data: key } = await supabaseAdmin
      .from("ingestion_api_keys")
      .select("id, org_id, server_id, scopes, revoked_at, expires_at, rate_limit_per_minute")
      .eq("key_hash", await sha256Hex(token))
      .maybeSingle();
    const decision = authorizeKey(key, "logs:ingest");
    if (!decision.ok || !key) {
      if (key) await audit(key.id, key.org_id, endpoint, decision.ok ? 401 : decision.status, 0, decision.ok ? "invalid_api_key" : decision.error);
      return json(decision.ok ? 401 : decision.status, { error: decision.ok ? "invalid_api_key" : decision.error });
    }
    keyId = key.id;
    orgId = key.org_id; // tenant comes only from the credential

    const since = new Date(Date.now() - 60_000).toISOString();
    const { count } = await supabaseAdmin.from("ingestion_api_requests").select("id", { count: "exact", head: true }).eq("api_key_id", key.id).gte("created_at", since);
    if (isRateLimited(count ?? 0, key.rate_limit_per_minute)) {
      await audit(keyId, orgId, endpoint, 429, 0, "rate_limited");
      return new Response(JSON.stringify({ error: "rate_limited" }), { status: 429, headers: { "content-type": "application/json", "retry-after": "60" } });
    }

    const len = Number(request.headers.get("content-length") ?? 0);
    const text = len > MAX_BODY_BYTES ? null : await request.text();
    if (text === null || new TextEncoder().encode(text).length > MAX_BODY_BYTES) {
      await audit(keyId, orgId, endpoint, 413, 0, "payload_too_large");
      return json(413, { error: "payload_too_large", max_bytes: MAX_BODY_BYTES });
    }
    let body: unknown;
    try { body = JSON.parse(text); } catch { await audit(keyId, orgId, endpoint, 400, 0, "invalid_json"); return json(400, { error: "invalid_json" }); }
    if (body && typeof body === "object" && ("org_id" in body || "organization_id" in body)) {
      await audit(keyId, orgId, endpoint, 403, 0, "org_override_forbidden");
      return json(403, { error: "organization_is_defined_by_api_key" });
    }
    // Collector metadata is untrusted: bind it to the already authenticated key and tenant.
    let collectorServer: string | null = null;
    if (body && typeof body === "object" && "collector_id" in body) {
      const { data: c } = await supabaseAdmin.from("collectors").select("id,server_id,sources").eq("id", String(body.collector_id)).eq("org_id", orgId).eq("api_key_id", keyId).maybeSingle();
      if (!c) { await audit(keyId, orgId, endpoint, 403, 0, "collector_not_authorized"); return json(403, { error: "collector_not_authorized" }); }
      collectorId = c.id; collectorServer = c.server_id;
      if (!("heartbeat" in body)) {
        const sourceId = "source_id" in body ? body.source_id : null;
        const sources = Array.isArray(c.sources) ? c.sources.map(s => sourceSchema.safeParse(s)).filter(s => s.success).map(s => s.data) : [];
        const source = sources.find(s => s?.id === sourceId);
        if (!source || !("source_type" in body) || source.type !== body.source_type) { await audit(keyId, orgId, endpoint, 403, 0, "source_not_configured"); return json(403, { error: "source_not_configured" }); }
      }
    }
    if (body && typeof body === "object" && "heartbeat" in body) {
      const hb = heartbeatSchema.safeParse(body);
      if (!hb.success || !collectorId) return json(400, { error: "invalid_heartbeat" });
      const { data: server } = await supabaseAdmin.from("servers").select("hostname,os").eq("id", collectorServer ?? "").eq("org_id", orgId).single();
      if (!server || server.hostname.toLowerCase() !== hb.data.hostname.toLowerCase() || server.os !== hb.data.operating_system) { await audit(keyId, orgId, endpoint, 403, 0, "source_not_authorized"); return json(403, { error: "source_not_authorized_for_key" }); }
      await supabaseAdmin.rpc("record_collector_delivery", { _id: collectorId, _accepted: 0, _event_at: new Date().toISOString(), _heartbeat: true, _status: 202 });
      await supabaseAdmin.from("collectors").update({ reported_version: hb.data.version }).eq("id", collectorId).eq("org_id", orgId);
      await audit(keyId, orgId, endpoint, 202, 0);
      return json(202, { heartbeat: "confirmed", collector_id: collectorId });
    }
    const parsed = batchSchema.safeParse(body);
    if (!parsed.success) {
      await audit(keyId, orgId, endpoint, 400, 0, "invalid_payload");
      return json(400, { error: "invalid_payload", issues: parsed.error.issues.slice(0, 20).map((i) => ({ path: i.path.join("."), message: i.message })) });
    }
    const p = parsed.data;

    // Server resolution: bound keys only accept their own server.
    let server: { id: string; hostname: string; os: string; environment: string } | null = null;
    if (key.server_id || collectorServer) {
      const { data: s } = await supabaseAdmin.from("servers").select("id, hostname, os, environment").eq("id", collectorServer ?? key.server_id ?? "").eq("org_id", orgId).maybeSingle();
      if (!s || s.hostname.toLowerCase() !== p.hostname.toLowerCase()) {
        await audit(keyId, orgId, endpoint, 403, 0, "source_not_authorized");
        return json(403, { error: "source_not_authorized_for_key" });
      }
      server = s;
    } else {
      const { data: s } = await supabaseAdmin.from("servers").select("id, hostname, os, environment").eq("org_id", orgId).ilike("hostname", p.hostname).limit(1).maybeSingle();
      server = s ?? null;
      if (!server) {
        if (!p.operating_system) { await audit(keyId, orgId, endpoint, 400, 0, "operating_system_required"); return json(400, { error: "operating_system_required", detail: "Informe operating_system (windows|linux) para cadastrar um servidor novo." }); }
        const { data: created, error } = await supabaseAdmin.from("servers")
          .insert({ org_id: orgId, hostname: p.hostname, os: p.operating_system, environment: p.environment ?? "production" })
          .select("id, hostname, os, environment").single();
        if (error || !created) throw new Error(error?.message ?? "server create failed");
        server = created;
      }
    }
    if (p.operating_system && p.operating_system !== server.os) { await audit(keyId, orgId, endpoint, 403, 0, "operating_system_mismatch"); return json(403, { error: "operating_system_mismatch" }); }

    // Idempotent retry of the same batch.
    if (p.batch_id) {
      const { data: prev } = await supabaseAdmin.from("ingestion_batches").select("id, status, events_received, events_accepted, events_duplicated, events_rejected").eq("org_id", orgId).eq("external_batch_id", p.batch_id).maybeSingle();
      if (prev && prev.status !== "failed" && prev.status !== "received") {
        await audit(keyId, orgId, endpoint, 202, 0, "batch_replay");
        return json(202, { batch_id: prev.id, replay: true, status: prev.status, received: prev.events_received, accepted: prev.events_accepted, duplicated: prev.events_duplicated, rejected: prev.events_rejected });
      }
    }

    const { data: batch, error: bErr } = await supabaseAdmin.from("ingestion_batches")
      .upsert({ org_id: orgId, api_key_id: keyId, collector_id: collectorId, server_id: server.id, external_batch_id: p.batch_id ?? null, source_type: p.source_type, status: "received", events_received: p.events.length }, { onConflict: "org_id,external_batch_id" })
      .select("id").single();
    if (bErr || !batch) throw new Error(bErr?.message ?? "batch create failed");

    const rejected: { index: number; reason: string }[] = [];
    const rows = [];
    for (let i = 0; i < p.events.length; i++) {
      const ev = eventSchema.safeParse(p.events[i]);
      if (!ev.success) { rejected.push({ index: i, reason: ev.error.issues[0]?.message ?? "invalid" }); continue; }
      const n = normalizeEvent(ev.data, p.source_type);
      if (!n) { rejected.push({ index: i, reason: "unparseable_raw" }); continue; }
      rows.push({
        org_id: orgId, server_id: server.id, timestamp: n.timestamp, operating_system: server.os, hostname: server.hostname,
        source_type: n.source_type, service_name: n.service_name, environment: server.environment, severity: n.severity,
        event_category: n.event_category, message: n.message.slice(0, 8000), raw_message: n.raw_message.slice(0, 32000),
        client_ip: n.client_ip, username: n.username, http_method: n.http_method, http_status: n.http_status,
        request_path: n.request_path, response_time: n.response_time, user_agent: n.user_agent,
        attributes: { ...n.attributes, ingest_batch_id: batch.id, ...(collectorId ? { collector_id: collectorId, source_id: p.source_id } : {}), ...(ev.data.external_id ? { external_id: ev.data.external_id } : {}) } as never,
        dedup_hash: await sha256Hex(dedupInput(server.id, p.source_type, ev.data, n)),
      });
    }

    let accepted = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const { data: ins, error } = await supabaseAdmin.from("log_events").upsert(rows.slice(i, i + 500), { onConflict: "org_id,dedup_hash", ignoreDuplicates: true }).select("id");
      if (error) {
        await supabaseAdmin.from("ingestion_batches").update({ status: "failed", errors: [{ reason: "persist_failed" }] }).eq("id", batch.id);
        await audit(keyId, orgId, endpoint, 503, p.events.length, "persist_failed");
        return json(503, { error: "temporarily_unavailable", batch_id: batch.id });
      }
      accepted += ins?.length ?? 0;
    }
    const duplicated = rows.length - accepted;
    const status = rejected.length ? "processed_with_errors" : "processed";
    await supabaseAdmin.from("ingestion_batches").update({ status, events_accepted: accepted, events_duplicated: duplicated, events_rejected: rejected.length, errors: rejected.slice(0, 100) as never }).eq("id", batch.id);
    await supabaseAdmin.from("ingestion_api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyId);
    await supabaseAdmin.from("servers").update({ last_seen_at: new Date().toISOString() }).eq("id", server.id);
    if (collectorId) await supabaseAdmin.rpc("record_collector_delivery", { _id: collectorId, _accepted: accepted, _event_at: rows.reduce((max, r) => r.timestamp > max ? r.timestamp : max, "1970-01-01T00:00:00Z"), _heartbeat: false, _status: rejected.length ? 422 : 202, ...(rejected.length ? { _error: "events_rejected" } : {}) });
    await audit(keyId, orgId, endpoint, 202, p.events.length);
    return json(202, { batch_id: batch.id, status, received: p.events.length, accepted, duplicated, rejected: rejected.length, rejected_detail: rejected.slice(0, 20) });
  } catch (e) {
    console.error("[ingest]", e instanceof Error ? e.message : "unknown");
    try { await audit(keyId, orgId, endpoint, 500, 0, "internal_error"); } catch { /* ignore */ }
    return json(500, { error: "internal_error" });
  }
}
