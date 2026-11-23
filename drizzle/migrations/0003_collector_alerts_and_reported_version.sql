ALTER TABLE public.collectors ADD COLUMN reported_version text;
CREATE OR REPLACE FUNCTION public.evaluate_api_batch_alerts() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record; c int; rank_min int;
BEGIN
 IF NEW.status NOT IN ('processed','processed_with_errors') OR NEW.events_accepted=0 THEN RETURN NEW; END IF;
 FOR r IN SELECT * FROM public.alert_rules WHERE org_id=NEW.org_id AND enabled LOOP
 rank_min:=array_position(ARRAY['DEBUG','INFO','WARN','ERROR','CRITICAL'],r.min_severity);
 SELECT count(*) INTO c FROM public.log_events e WHERE e.org_id=NEW.org_id AND e.observed_timestamp>now()-make_interval(mins=>r.window_minutes) AND array_position(ARRAY['DEBUG','INFO','WARN','ERROR','CRITICAL'],e.severity)>=rank_min AND (r.source_type IS NULL OR e.source_type=r.source_type) AND (r.message_contains IS NULL OR e.message ILIKE '%'||r.message_contains||'%' OR e.event_category ILIKE '%'||r.message_contains||'%') AND (r.http_status_min IS NULL OR e.http_status>=r.http_status_min);
 IF c>=r.threshold AND NOT EXISTS(SELECT 1 FROM public.alert_occurrences o WHERE o.org_id=NEW.org_id AND o.rule_id=r.id AND o.status='open' AND o.triggered_at>now()-make_interval(mins=>r.window_minutes)) THEN INSERT INTO public.alert_occurrences(org_id,rule_id,event_count,message) VALUES(NEW.org_id,r.id,c,r.name||': '||c||' eventos nos últimos '||r.window_minutes||' min'); END IF;
 END LOOP;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.evaluate_api_batch_alerts() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER evaluate_api_alerts AFTER UPDATE OF status ON public.ingestion_batches FOR EACH ROW EXECUTE FUNCTION public.evaluate_api_batch_alerts();