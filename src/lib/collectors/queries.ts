import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { sourceSchema } from "./core";

export const collectorsQuery = (orgId: string) => queryOptions({
  queryKey: ["collectors", orgId],
  queryFn: async () => {
    const { data, error } = await supabase.from("collectors").select("*,servers(hostname,os,environment)").eq("org_id", orgId).order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(c => ({ ...c, sources: Array.isArray(c.sources) ? c.sources.flatMap(s => { const p = sourceSchema.safeParse(s); return p.success ? [p.data] : []; }) : [] }));
  },
  refetchInterval: 15_000,
});