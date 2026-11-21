import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/v1/ingestion/health")({
  server: {
    handlers: {
      GET: async () => Response.json({ status: "ok", api: "v1", time: new Date().toISOString() }, { headers: { "cache-control": "no-store" } }),
    },
  },
});
