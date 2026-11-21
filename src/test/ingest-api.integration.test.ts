// Opt-in live test of the ingestion API. Needs INGEST_API_KEY (a real key) and INGEST_BASE_URL.
import { describe, expect, it } from "vitest";

const key = process.env["INGEST_API_KEY"] ?? "";
const base = process.env["INGEST_BASE_URL"] ?? "http://localhost:8080";
const url = `${base}/api/v1/logs/ingest`;
const post = (body: unknown, auth = `Bearer ${key}`) =>
  fetch(url, { method: "POST", headers: { "content-type": "application/json", authorization: auth }, body: typeof body === "string" ? body : JSON.stringify(body) });

describe.skipIf(!key)("Live ingestion API", () => {
  const batch = { batch_id: `it-${Date.now()}`, hostname: "IT-HOST-01", operating_system: "linux", source_type: "generic", events: [{ external_id: `it-${Date.now()}`, message: "integration event" }] };
  it("health does not leak internals", async () => {
    const r = await fetch(`${base}/api/v1/ingestion/health`);
    expect(r.status).toBe(200);
    expect(Object.keys(await r.json()).sort()).toEqual(["api", "status", "time"]);
  });
  it("rejects missing and invalid keys", async () => {
    expect((await post(batch, "")).status).toBe(401);
    expect((await post(batch, `Bearer lsk_${"a".repeat(43)}`)).status).toBe(401);
  });
  it("accepts a batch, then replays it idempotently", async () => {
    const a = await post(batch);
    expect(a.status).toBe(202);
    expect((await a.json()).accepted).toBe(1);
    const b = await (await post(batch)).json();
    expect(b.replay).toBe(true);
  });
  it("deduplicates the same external_id in a new batch", async () => {
    const r = await (await post({ ...batch, batch_id: `${batch.batch_id}-2` })).json();
    expect(r).toMatchObject({ accepted: 0, duplicated: 1 });
  });
  it("refuses org override, invalid and oversized payloads", async () => {
    expect((await post({ ...batch, org_id: "00000000-0000-0000-0000-000000000000" })).status).toBe(403);
    expect((await post({ hostname: "x" })).status).toBe(400);
    expect((await post("x".repeat(1024 * 1024 + 1))).status).toBe(413);
  });
});
