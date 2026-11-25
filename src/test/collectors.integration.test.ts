// Opt-in real HTTP tests. Fixture contains only isolated test-tenant credentials.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";

const enabled = process.env["RUN_COLLECTOR_TESTS"] === "1";
type Key = { id: string; key: string };
type Fixture = { id: string; org_id: string; server_id: string; sources: { id: string; type: string }[] };
const folder = process.env["COLLECTOR_FIXTURE_DIR"] ?? "";
const fixture: Fixture | null = enabled ? JSON.parse(readFileSync(`${folder}/fixture.json`, "utf8")) : null;
const keys: { bound: Key; expired: Key; rate: Key; revoked: Key } | null = enabled ? JSON.parse(readFileSync(`${folder}/keys.json`, "utf8")) : null;
const originalKey = enabled ? readFileSync(`${folder}/key.txt`, "utf8").trim() : "";
const base = process.env["INGEST_BASE_URL"] ?? "http://localhost:8080";
const payload = { hostname: "COLLECTOR-LIVE-01", operating_system: "linux", source_type: "generic", events: [{ external_id: `collector-live-${Date.now()}`, message: "Real HTTP collector regression" }] };
const post = (key: string, body: unknown = payload, endpoint = "/api/public/v1/logs/ingest") => fetch(`${base}${endpoint}`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` }, body: typeof body === "string" ? body : JSON.stringify(body) });

describe.skipIf(!enabled)("Live collector API security", () => {
  it("expired key is actually rejected over HTTP", async () => { expect((await post(keys?.expired.key ?? "")).status).toBe(401); });
  it("revoked key is actually rejected over HTTP", async () => { expect((await post(keys?.revoked.key ?? "")).status).toBe(401); });
  it("bound key rejects another hostname", async () => { expect((await post(keys?.bound.key ?? "", { ...payload, hostname: "FOREIGN-HOST" })).status).toBe(403); });
  it("bound key rejects OS mismatch", async () => { expect((await post(keys?.bound.key ?? "", { ...payload, operating_system: "windows" })).status).toBe(403); });
  it("one-request quota returns 429 and Retry-After", async () => {
    expect((await post(keys?.rate.key ?? "")).status).toBe(202);
    const r = await post(keys?.rate.key ?? ""); expect(r.status).toBe(429); expect(r.headers.get("retry-after")).toBe("60");
  });
  it("both aliases accept and deduplicate a real authenticated event", async () => {
    const a = await post(keys?.bound.key ?? "", { ...payload, events: [{ external_id: `alias-${Date.now()}`, message: "Alias collector test" }] }, "/api/v1/logs/ingest");
    expect(a.status).toBe(202); expect((await a.json()).accepted).toBe(1);
    const body = { ...payload, batch_id: `batch-${Date.now()}` };
    const b = await post(keys?.bound.key ?? "", body); expect(b.status).toBe(202);
    const replay = await (await post(keys?.bound.key ?? "", body)).json(); expect(replay.replay).toBe(true);
  });
  it("refuses tenant override and foreign collector", async () => {
    expect((await post(originalKey, { ...payload, org_id: "22222222-2222-4222-8222-222222222222" })).status).toBe(403);
    expect((await post(originalKey, { ...payload, collector_id: "22222222-2222-4222-8222-222222222222" })).status).toBe(403);
  });
  it("refuses a source not registered for this collector", async () => {
    expect((await post(originalKey, { ...payload, collector_id: fixture?.id, source_id: "22222222-2222-4222-8222-222222222222" })).status).toBe(403);
  });
  it("refuses more than 1 MB and more than 1000 events", async () => {
    expect((await post(originalKey, "x".repeat(1048577))).status).toBe(413);
    expect((await post(originalKey, { ...payload, events: Array(1001).fill({ message: "x" }) })).status).toBe(400);
  });
  it("new collector tables and aggregate reject foreign tenant", async () => {
    const session = JSON.parse(readFileSync(process.env["TENANT_SESSION_FILE"] ?? "", "utf8"));
    const client = createClient(process.env["SUPABASE_URL"] ?? "http://localhost", process.env["SUPABASE_PUBLISHABLE_KEY"] ?? "disabled", { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${session.session.access_token}` } } });
    const foreign = "22222222-2222-4222-8222-222222222222";
    for (const table of ["collectors", "collector_audit"]) { const r = await client.from(table).select("id").eq("org_id", foreign); expect(r.error).toBeNull(); expect(r.data).toEqual([]); }
    const r = await client.rpc("collector_hourly", { _org: foreign, _collector: fixture?.id }); expect(r.error?.message).toContain("forbidden");
    const write = await client.from("collectors").update({ name: "denied" }).eq("org_id", foreign); expect(write.error?.code).toBe("42501");
  });
});