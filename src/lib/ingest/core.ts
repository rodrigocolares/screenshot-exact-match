// Pure ingestion-API logic (no I/O) so it can be unit-tested.
import { z } from "zod";
import { parseLogs, normalizeSeverity, type LogType, type ParsedEvent } from "@/lib/logs/parsers";

export const MAX_BODY_BYTES = 1024 * 1024;
export const MAX_EVENTS_PER_BATCH = 1000;
export const KEY_PREFIX = "lsk_";

export async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function generateApiKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return KEY_PREFIX + btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function displayPrefix(key: string) {
  return key.slice(0, 12);
}

export function extractBearer(header: string | null): string | null {
  if (!header?.startsWith("Bearer ")) return null;
  const t = header.slice(7).trim();
  return /^lsk_[A-Za-z0-9_-]{40,60}$/.test(t) ? t : null;
}

export type KeyRow = {
  revoked_at: string | null;
  expires_at: string | null;
  scopes: string[];
};

export type KeyDecision = { ok: true } | { ok: false; status: 401 | 403; error: string };

export function authorizeKey(row: KeyRow | null, scope: string, now = new Date()): KeyDecision {
  if (!row) return { ok: false, status: 401, error: "invalid_api_key" };
  if (row.revoked_at) return { ok: false, status: 401, error: "revoked_api_key" };
  if (row.expires_at && new Date(row.expires_at) <= now) return { ok: false, status: 401, error: "expired_api_key" };
  if (!row.scopes.includes(scope)) return { ok: false, status: 403, error: "insufficient_scope" };
  return { ok: true };
}

export function isRateLimited(requestsLastMinute: number, limit: number) {
  return requestsLastMinute >= limit;
}

const safeText = (max: number) => z.string().max(max).transform((s) => s.replace(/\u0000/g, ""));

export const eventSchema = z
  .object({
    external_id: safeText(200).optional(),
    timestamp: z.string().datetime({ offset: true }).optional(),
    severity: z.string().max(20).optional(),
    message: safeText(8000).optional(),
    raw: safeText(32000).optional(),
    service_name: safeText(200).optional(),
    attributes: z.record(z.string().max(100), z.unknown()).optional(),
  })
  .refine((e) => e.message || e.raw, { message: "message ou raw é obrigatório" });

export const batchSchema = z.object({
  batch_id: safeText(200).optional(),
  hostname: z.string().min(1).max(255).regex(/^[A-Za-z0-9._-]+$/),
  operating_system: z.enum(["windows", "linux"]).optional(),
  source_type: z.string().regex(/^[a-z0-9_]{1,40}$/),
  environment: safeText(40).optional(),
  events: z.array(z.unknown()).min(1).max(MAX_EVENTS_PER_BATCH),
});

export type BatchPayload = z.infer<typeof batchSchema>;
export type ApiEvent = z.infer<typeof eventSchema>;

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown, max = 2000) => (typeof v === "string" ? v.slice(0, max) : null);

/** Normalize one API event; `raw` lines reuse the existing file parsers. */
export function normalizeEvent(e: ApiEvent, sourceType: string, now = new Date()): ParsedEvent | null {
  if (e.raw && !e.message) {
    const known = ["iis_access", "iis_ftp", "apache_access", "apache_error", "nginx_access", "nginx_error", "java_app", "linux_auth", "syslog", "vsftpd", "json", "generic"];
    const type = (known.includes(sourceType) ? sourceType : "auto") as LogType;
    const p = parseLogs(e.raw, type, now).events[0];
    if (!p) return null;
    if (e.timestamp) p.timestamp = new Date(e.timestamp).toISOString();
    if (e.severity) p.severity = normalizeSeverity(e.severity);
    return p;
  }
  const a = e.attributes ?? {};
  return {
    timestamp: new Date(e.timestamp ?? now).toISOString(),
    source_type: sourceType,
    service_name: e.service_name ?? null,
    severity: normalizeSeverity(e.severity ?? "INFO"),
    event_category: str(a["event_category"], 100),
    message: e.message ?? "",
    raw_message: e.raw ?? e.message ?? "",
    client_ip: str(a["client_ip"], 64),
    username: str(a["username"], 200),
    http_method: str(a["http_method"], 16),
    http_status: num(a["http_status"]),
    request_path: str(a["request_path"]),
    response_time: num(a["response_time_ms"]) ?? num(a["response_time"]),
    user_agent: str(a["user_agent"], 1000),
    attributes: a,
  };
}

/** Stable dedup hash: collector external_id wins, otherwise event content. */
export function dedupInput(serverId: string, sourceType: string, e: ApiEvent, n: ParsedEvent) {
  return e.external_id
    ? `ext|${serverId}|${e.external_id}`
    : `${serverId}|${sourceType}|${n.timestamp}|${n.raw_message || n.message}`;
}
