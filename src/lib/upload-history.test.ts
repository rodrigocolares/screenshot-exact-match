import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { expect, it } from "vitest";
import { refreshUploadHistory } from "./upload-history";

it("reads the completed upload into the active organization history before resolving", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let rows: string[] = [];
  const observer = new QueryObserver(client, { queryKey: ["jobs", "org-a"], queryFn: async () => [...rows] });
  const unsubscribe = observer.subscribe(() => {});
  await observer.refetch();
  client.setQueryData(["jobs", "org-b"], ["other-tenant.log"]);
  rows = ["new-upload.log"];
  await refreshUploadHistory(client, "org-a");
  expect(client.getQueryData(["jobs", "org-a"])).toEqual(["new-upload.log"]);
  expect(client.getQueryData(["jobs", "org-b"])).toEqual(["other-tenant.log"]);
  unsubscribe();
  client.clear();
});