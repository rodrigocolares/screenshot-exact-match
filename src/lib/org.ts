import { queryOptions, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type OrgContext = { orgId: string; orgName: string; role: "admin" | "analyst" | "viewer"; userId: string; email: string };

export const orgQuery = queryOptions({
  queryKey: ["org"],
  queryFn: async (): Promise<OrgContext> => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw new Error("Não autenticado");
    const { data: m, error } = await supabase
      .from("organization_members")
      .select("org_id, role, organizations(name)")
      .eq("user_id", u.user.id)
      .order("created_at")
      .limit(1)
      .single();
    if (error || !m) throw new Error("Organização não encontrada");
    return {
      orgId: m.org_id,
      role: m.role,
      orgName: (m.organizations as { name: string } | null)?.name ?? "Organização",
      userId: u.user.id,
      email: u.user.email ?? "",
    };
  },
  staleTime: 5 * 60_000,
});

export const useOrg = () => useQuery(orgQuery);
