CREATE TABLE public.collectors (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE, api_key_id uuid NOT NULL REFERENCES public.ingestion_api_keys(id),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 100), version text NOT NULL DEFAULT '4.2',
 sources jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(sources) = 'array'),
 last_heartbeat_at timestamptz, last_delivery_at timestamptz, last_event_at timestamptz,
 last_error_at timestamptz, last_error text, last_http_status int, events_total bigint NOT NULL DEFAULT 0,
 created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(org_id,id)
);
GRANT SELECT ON public.collectors TO authenticated;
GRANT ALL ON public.collectors TO service_role;
ALTER TABLE public.collectors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read collectors" ON public.collectors FOR SELECT TO authenticated USING(public.is_org_member(org_id));
CREATE INDEX ON public.collectors(org_id,server_id);
CREATE TABLE public.collector_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 collector_id uuid REFERENCES public.collectors(id) ON DELETE SET NULL, actor_id uuid, action text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.collector_audit TO authenticated;
GRANT ALL ON public.collector_audit TO service_role;
ALTER TABLE public.collector_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read collector audit" ON public.collector_audit FOR SELECT TO authenticated USING(public.is_org_admin(org_id));
CREATE OR REPLACE FUNCTION public.validate_collector_binding() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.servers s JOIN public.ingestion_api_keys k ON k.id = NEW.api_key_id WHERE s.id=NEW.server_id AND s.org_id=NEW.org_id AND k.org_id=NEW.org_id AND (k.server_id IS NULL OR k.server_id=s.id) AND k.revoked_at IS NULL AND (k.expires_at IS NULL OR k.expires_at>now()) AND 'logs:ingest'=ANY(k.scopes)) THEN RAISE EXCEPTION 'invalid collector binding'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER collector_binding BEFORE INSERT OR UPDATE OF org_id,server_id,api_key_id ON public.collectors FOR EACH ROW EXECUTE FUNCTION public.validate_collector_binding();
ALTER TABLE public.ingestion_batches ADD COLUMN collector_id uuid REFERENCES public.collectors(id) ON DELETE SET NULL;
ALTER TABLE public.ingestion_api_requests ADD COLUMN collector_id uuid REFERENCES public.collectors(id) ON DELETE SET NULL;
CREATE INDEX ON public.ingestion_batches(collector_id,created_at DESC);
CREATE INDEX ON public.ingestion_api_requests(collector_id,created_at DESC);
CREATE OR REPLACE FUNCTION public.record_collector_delivery(_id uuid, _accepted int, _event_at timestamptz, _heartbeat boolean, _status int, _error text DEFAULT NULL) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 UPDATE public.collectors SET
 last_heartbeat_at=CASE WHEN _heartbeat AND _status < 400 THEN now() ELSE last_heartbeat_at END,
 last_delivery_at=CASE WHEN NOT _heartbeat AND _status < 400 THEN now() ELSE last_delivery_at END,
 last_event_at=CASE WHEN _accepted>0 THEN greatest(last_event_at,_event_at) ELSE last_event_at END,
 events_total=events_total+greatest(_accepted,0), last_http_status=_status,
 last_error_at=CASE WHEN _error IS NOT NULL THEN now() ELSE last_error_at END,
 last_error=CASE WHEN _error IS NOT NULL THEN left(_error,200) ELSE last_error END WHERE id=_id;
$$;
REVOKE ALL ON FUNCTION public.record_collector_delivery(uuid,int,timestamptz,boolean,int,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_collector_delivery(uuid,int,timestamptz,boolean,int,text) TO service_role;
CREATE OR REPLACE FUNCTION public.collector_hourly(_org uuid,_collector uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.is_org_member(_org) THEN RAISE EXCEPTION 'forbidden'; END IF;
 RETURN coalesce((SELECT jsonb_agg(x) FROM(SELECT date_trunc('hour',created_at) AS hour,sum(events_accepted) AS events FROM public.ingestion_batches WHERE org_id=_org AND collector_id=_collector AND created_at>now()-interval '24 hours' GROUP BY 1 ORDER BY 1) x),'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.collector_hourly(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.collector_hourly(uuid,uuid) TO authenticated;
