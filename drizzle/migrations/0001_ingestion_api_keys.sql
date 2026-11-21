CREATE TABLE public.ingestion_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  server_id uuid REFERENCES public.servers(id) ON DELETE SET NULL,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  description text,
  key_prefix text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  scopes text[] NOT NULL DEFAULT ARRAY['logs:ingest'],
  rate_limit_per_minute int NOT NULL DEFAULT 120 CHECK (rate_limit_per_minute BETWEEN 1 AND 10000),
  expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz,
  rotated_from uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.ingestion_api_keys(org_id);
GRANT SELECT (id, org_id, server_id, name, description, key_prefix, scopes, rate_limit_per_minute, expires_at, revoked_at, last_used_at, rotated_from, created_by, created_at) ON public.ingestion_api_keys TO authenticated;
GRANT INSERT ON public.ingestion_api_keys TO authenticated;
GRANT UPDATE (revoked_at, name, description) ON public.ingestion_api_keys TO authenticated;
GRANT ALL ON public.ingestion_api_keys TO service_role;
ALTER TABLE public.ingestion_api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read keys" ON public.ingestion_api_keys FOR SELECT TO authenticated USING (public.is_org_admin(org_id));
CREATE POLICY "admins create keys" ON public.ingestion_api_keys FOR INSERT TO authenticated WITH CHECK (public.is_org_admin(org_id) AND created_by = auth.uid());
CREATE POLICY "admins update keys" ON public.ingestion_api_keys FOR UPDATE TO authenticated USING (public.is_org_admin(org_id)) WITH CHECK (public.is_org_admin(org_id));

CREATE TABLE public.ingestion_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  api_key_id uuid REFERENCES public.ingestion_api_keys(id) ON DELETE SET NULL,
  server_id uuid REFERENCES public.servers(id) ON DELETE SET NULL,
  external_batch_id text,
  source_type text NOT NULL,
  status text NOT NULL DEFAULT 'received',
  events_received int NOT NULL DEFAULT 0,
  events_accepted int NOT NULL DEFAULT 0,
  events_duplicated int NOT NULL DEFAULT 0,
  events_rejected int NOT NULL DEFAULT 0,
  errors jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, external_batch_id)
);
CREATE INDEX ON public.ingestion_batches(org_id, created_at DESC);
GRANT SELECT ON public.ingestion_batches TO authenticated;
GRANT ALL ON public.ingestion_batches TO service_role;
ALTER TABLE public.ingestion_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read batches" ON public.ingestion_batches FOR SELECT TO authenticated USING (public.is_org_member(org_id));

CREATE TABLE public.ingestion_api_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  api_key_id uuid REFERENCES public.ingestion_api_keys(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  status_code int NOT NULL,
  events int NOT NULL DEFAULT 0,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.ingestion_api_requests(api_key_id, created_at DESC);
GRANT SELECT ON public.ingestion_api_requests TO authenticated;
GRANT ALL ON public.ingestion_api_requests TO service_role;
ALTER TABLE public.ingestion_api_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read requests" ON public.ingestion_api_requests FOR SELECT TO authenticated USING (org_id IS NOT NULL AND public.is_org_admin(org_id));