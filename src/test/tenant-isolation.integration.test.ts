// Opt-in live backend regression suite. Only use an isolated temporary tenant fixture.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

const enabled = process.env["RUN_TENANT_TESTS"] === "1";
describe.skipIf(!enabled)("Live tenant isolation", () => {
  const session = enabled ? JSON.parse(readFileSync(process.env["TENANT_SESSION_FILE"] ?? "", "utf8")) : null;
  const org = process.env["TENANT_FOREIGN_ORG"] ?? "";
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? "";
  const client = createClient(process.env["SUPABASE_URL"] ?? "http://localhost", key || "disabled", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${session?.session.access_token ?? ""}` } },
  });
  const fixtures = {
    servers: { hostname: "denied", os: "linux" },
    ingestion_jobs: { file_name: "denied.log", log_type: "generic" },
    log_events: { timestamp: "2026-11-18T20:00:00Z", source_type: "generic", message: "denied", dedup_hash: "denied" },
    alert_rules: { name: "denied" },
    alert_occurrences: { event_count: 1, message: "denied" },
    ai_analyses: { content: "denied" },
    saved_queries: { user_id: session?.session.user.id, name: "denied" },
  };
  for (const [table, fixture] of Object.entries(fixtures)) {
    it(`${table}: rejects foreign reads, inserts, updates and deletes`, async () => {
      const read = await client.from(table).select("id").eq("org_id", org);
      expect(read.error).toBeNull();
      expect(read.data).toEqual([]);
      const insert = await client.from(table).insert({ ...fixture, org_id: org });
      expect(insert.error?.code).toBe("42501");
      const update = await client.from(table).update(fixture).eq("org_id", org).select("id");
      expect(update.error).toBeNull();
      expect(update.data).toEqual([]);
      const remove = await client.from(table).delete().eq("org_id", org).select("id");
      expect(remove.error).toBeNull();
      expect(remove.data).toEqual([]);
    });
  }
  for (const fn of ["dashboard_stats", "evaluate_alerts", "load_demo_data", "clear_demo_data"]) {
    it(`${fn}: denies foreign tenant`, async () => {
      const args = fn === "dashboard_stats" ? { _org: org, _since: "2026-11-18T00:00:00Z", _bucket: "hour" } : { _org: org };
      const result = await client.rpc(fn, args);
      expect(result.error?.message).toContain("forbidden");
    });
  }
  it("returns the authenticated user's own membership and denies foreign organization", async () => {
    const own = await client.from("organization_members").select("org_id").eq("user_id", session.session.user.id);
    expect(own.error).toBeNull();
    expect(own.data).toHaveLength(1);
    expect(own.data?.[0]?.org_id).not.toBe(org);
    const foreign = await client.from("organizations").select("id").eq("id", org);
    expect(foreign.error).toBeNull();
    expect(foreign.data).toEqual([]);
  });
});