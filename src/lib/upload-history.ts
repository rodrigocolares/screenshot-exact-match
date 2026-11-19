import type { QueryClient } from "@tanstack/react-query";

export async function refreshUploadHistory(client: QueryClient, orgId: string) {
  await client.invalidateQueries({ queryKey: ["jobs", orgId], exact: true, refetchType: "active" });
  void client.invalidateQueries({ predicate: (query) => query.queryKey[0] !== "jobs" && query.queryKey[0] !== "org" });
}