import { describe, expect, it } from "vitest";
import { collectorSchema, collectorState, generateConfig, COMMUNICATION_TIMEOUT_MS, EVENT_TIMEOUT_MS, isCollectorEndpoint } from "./core";
import { batchSchema, heartbeatSchema, MAX_BODY_BYTES, MAX_EVENTS_PER_BATCH } from "@/lib/ingest/core";
const id = "00000000-0000-4000-8000-000000000001";
const now = Date.parse("2026-11-22T03:00:00Z");
const stamp = (age: number) => new Date(now - age).toISOString();
const empty = { last_heartbeat_at: null, last_delivery_at: null, last_event_at: null, last_http_status: null };
describe("Collector rules", () => {
  it("never forwards API keys to an arbitrary endpoint", () => {
    expect(isCollectorEndpoint("https://pixel-perfect-recreation-2056.lovable.app/api/public/v1/logs/ingest")).toBe(true);
    expect(isCollectorEndpoint("https://attacker.test/api/v1/logs/ingest")).toBe(false);
    expect(isCollectorEndpoint("https://pixel-perfect-recreation-2056.lovable.app/api/v1/logs/ingest?key=x")).toBe(false);
  });
  it("does not infer connectivity from registration", () => expect(collectorState(empty, now)).toBe("unconfirmed"));
  it("separates real heartbeat from log-only delivery", () => {
    expect(collectorState({ ...empty, last_delivery_at: stamp(0), last_event_at: stamp(0) }, now)).toBe("logs_only");
    expect(collectorState({ ...empty, last_heartbeat_at: stamp(0), last_event_at: stamp(0) }, now)).toBe("heartbeat");
  });
  it("marks communication late after 5 minutes", () => expect(collectorState({ ...empty, last_heartbeat_at: stamp(COMMUNICATION_TIMEOUT_MS + 1) }, now)).toBe("delayed"));
  it("separates live agent without events for an hour", () => expect(collectorState({ ...empty, last_heartbeat_at: stamp(0), last_event_at: stamp(EVENT_TIMEOUT_MS + 1) }, now)).toBe("no_events"));
  it("reports failed delivery", () => expect(collectorState({ ...empty, last_http_status: 429 }, now)).toBe("error"));
  it("prevents injected configuration and storing extra credentials", () => {
    const valid = { orgId: id, serverId: id, apiKeyId: id, name: "coletor", version: "5.0.7", sources: [{ id, type: "generic", path: "/var/log/app.log" }] };
    expect(collectorSchema.safeParse({ ...valid, sources: [{ id, type: "generic", path: "/var/log/app.log\n[OUTPUT]" }] }).success).toBe(false);
    expect(collectorSchema.parse({ ...valid, api_key: "secret" })).not.toHaveProperty("api_key");
  });
  it("generates persistent offsets and loopback output without credentials", () => {
    const linux = generateConfig({ id, version: "5.0.7", sources: [{ id, type: "java_app", path: "/var/log/app.log" }] }, "linux");
    expect(linux).toContain(`DB /var/lib/logsentinel/${id}.db`);
    expect(linux).toContain("Host 127.0.0.1");
    expect(linux).toContain("multiline.parser logsentinel_java");
    expect(linux).not.toContain("Bearer");
    const win = generateConfig({ id, version: "5.0.7", sources: [{ id, type: "windows_event", path: "Security" }] }, "windows");
    expect(win).toContain("Name winevtlog");
    expect(win).toContain("Channels Security");
  });
  it("preserves exact ingestion quotas", () => {
    expect(MAX_BODY_BYTES).toBe(1048576); expect(MAX_EVENTS_PER_BATCH).toBe(1000);
    expect(batchSchema.safeParse({ hostname: "host", source_type: "generic", events: Array(1001).fill({ message: "x" }) }).success).toBe(false);
  });
  it("requires authenticated-source metadata for heartbeat", () => {
    expect(heartbeatSchema.safeParse({ heartbeat: true, collector_id: id, hostname: "host", operating_system: "linux", version: "5.0.7" }).success).toBe(true);
    expect(heartbeatSchema.safeParse({ heartbeat: true, collector_id: id, hostname: "host" }).success).toBe(false);
  });
});