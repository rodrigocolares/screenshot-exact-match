import { describe, expect, it } from "vitest";
import { authorizeKey, batchSchema, dedupInput, eventSchema, extractBearer, generateApiKey, isRateLimited, MAX_EVENTS_PER_BATCH, normalizeEvent, sha256Hex } from "./core";

const now = new Date("2026-11-21T12:00:00Z");
const key = { revoked_at: null, expires_at: null, scopes: ["logs:ingest"] };

describe("ingestion API core", () => {
  it("accepts a valid key", () => expect(authorizeKey(key, "logs:ingest", now)).toEqual({ ok: true }));
  it("rejects unknown key with 401", () => expect(authorizeKey(null, "logs:ingest", now)).toMatchObject({ status: 401, error: "invalid_api_key" }));
  it("rejects expired key", () => expect(authorizeKey({ ...key, expires_at: "2026-11-21T11:59:59Z" }, "logs:ingest", now)).toMatchObject({ status: 401, error: "expired_api_key" }));
  it("rejects revoked key", () => expect(authorizeKey({ ...key, revoked_at: "2026-11-20T00:00:00Z" }, "logs:ingest", now)).toMatchObject({ status: 401, error: "revoked_api_key" }));
  it("rejects missing scope with 403", () => expect(authorizeKey({ ...key, scopes: [] }, "logs:ingest", now)).toMatchObject({ status: 403 }));
  it("rate limits at the per-minute limit", () => {
    expect(isRateLimited(119, 120)).toBe(false);
    expect(isRateLimited(120, 120)).toBe(true);
  });
  it("generates unique high-entropy keys accepted by the bearer parser", () => {
    const a = generateApiKey(), b = generateApiKey();
    expect(a).not.toBe(b);
    expect(extractBearer(`Bearer ${a}`)).toBe(a);
    expect(extractBearer(a)).toBeNull();
    expect(extractBearer("Bearer lsk_short")).toBeNull();
  });
  it("hashes keys so plaintext is never stored", async () => {
    const k = generateApiKey();
    const h = await sha256Hex(k);
    expect(h).toHaveLength(64);
    expect(h).not.toContain(k);
  });
  it("rejects invalid payloads", () => {
    expect(batchSchema.safeParse({ hostname: "x", source_type: "IIS; drop", events: [{}] }).success).toBe(false);
    expect(batchSchema.safeParse({ hostname: "x", source_type: "iis_access", events: [] }).success).toBe(false);
    expect(eventSchema.safeParse({ severity: "ERROR" }).success).toBe(false);
  });
  it("rejects batches above the event limit", () => {
    const events = Array.from({ length: MAX_EVENTS_PER_BATCH + 1 }, () => ({ message: "x" }));
    expect(batchSchema.safeParse({ hostname: "h", source_type: "generic", events }).success).toBe(false);
  });
  it("maps structured attributes without inventing fields", () => {
    const e = eventSchema.parse({ timestamp: "2026-11-21T12:30:00Z", severity: "ERROR", message: "HTTP 500", attributes: { http_status: 500, client_ip: "192.0.2.10", response_time_ms: 2400 } });
    const n = normalizeEvent(e, "iis_access", now)!;
    expect(n).toMatchObject({ severity: "ERROR", http_status: 500, client_ip: "192.0.2.10", response_time: 2400, username: null });
  });
  it("reuses file parsers for raw lines", () => {
    const e = eventSchema.parse({ raw: '192.0.2.5 - - [21/Nov/2026:12:00:00 +0000] "GET /x HTTP/1.1" 503 12 "-" "curl"' });
    expect(normalizeEvent(e, "nginx_access", now)).toMatchObject({ http_status: 503, request_path: "/x" });
  });
  it("dedups retries by external_id and by content", () => {
    const e = eventSchema.parse({ external_id: "evt-1", message: "a" });
    const n = normalizeEvent(e, "generic", now)!;
    expect(dedupInput("s", "generic", e, n)).toBe(dedupInput("s", "generic", { ...e, message: "changed" }, n));
    const c = eventSchema.parse({ message: "same", timestamp: "2026-11-21T12:00:00Z" });
    expect(dedupInput("s", "generic", c, normalizeEvent(c, "generic", now)!)).toBe(dedupInput("s", "generic", c, normalizeEvent(c, "generic", now)!));
  });
});
