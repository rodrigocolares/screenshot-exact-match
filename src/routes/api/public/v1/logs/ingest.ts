import { createFileRoute } from "@tanstack/react-router";
import { handleIngest } from "@/lib/ingest/handler.server";

export const Route = createFileRoute("/api/public/v1/logs/ingest")({
  server: {
    handlers: {
      POST: async ({ request }) => handleIngest(request, "/api/public/v1/logs/ingest"),
    },
  },
});
