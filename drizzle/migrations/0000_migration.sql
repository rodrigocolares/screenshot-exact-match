
-- Profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  default_org_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());

-- Organizations
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TYPE public.org_role AS ENUM ('admin','analyst','viewer');
CREATE TABLE public.organization_members (
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role public.org_role NOT NULL DEFAULT 'viewer',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, user_id)
);
GRANT SELECT, UPDATE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
GRANT SELECT ON public.organization_members TO authenticated;
GRANT ALL ON public.organization_members TO service_role;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_org_member(_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.organization_members WHERE org_id = _org AND user_id = auth.uid())
$$;
CREATE OR REPLACE FUNCTION public.can_write_org(_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.organization_members WHERE org_id = _org AND user_id = auth.uid() AND role IN ('admin','analyst'))
$$;
CREATE OR REPLACE FUNCTION public.is_org_admin(_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.organization_members WHERE org_id = _org AND user_id = auth.uid() AND role = 'admin')
$$;

CREATE POLICY "members read org" ON public.organizations FOR SELECT TO authenticated USING (public.is_org_member(id));
CREATE POLICY "admins update org" ON public.organizations FOR UPDATE TO authenticated USING (public.is_org_admin(id));
CREATE POLICY "members read membership" ON public.organization_members FOR SELECT TO authenticated USING (public.is_org_member(org_id));

-- Servers
CREATE TABLE public.servers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  hostname text NOT NULL,
  os text NOT NULL CHECK (os IN ('windows','linux')),
  os_version text,
  address text,
  environment text NOT NULL DEFAULT 'production' CHECK (environment IN ('production','staging','development')),
  owner text,
  applications text[] NOT NULL DEFAULT '{}',
  services text[] NOT NULL DEFAULT '{}',
  tags text[] NOT NULL DEFAULT '{}',
  agent_status text NOT NULL DEFAULT 'not_installed',
  last_seen_at timestamptz,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, hostname)
);
CREATE INDEX ON public.servers (org_id);

-- Ingestion jobs
CREATE TABLE public.ingestion_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  server_id uuid REFERENCES public.servers(id) ON DELETE SET NULL,
  file_name text NOT NULL,
  log_type text NOT NULL,
  file_hash text,
  status text NOT NULL DEFAULT 'processing',
  lines_total int NOT NULL DEFAULT 0,
  lines_imported int NOT NULL DEFAULT 0,
  lines_rejected int NOT NULL DEFAULT 0,
  lines_duplicated int NOT NULL DEFAULT 0,
  errors jsonb NOT NULL DEFAULT '[]',
  is_demo boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.ingestion_jobs (org_id, created_at DESC);

-- Log events
CREATE TABLE public.log_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  server_id uuid REFERENCES public.servers(id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.ingestion_jobs(id) ON DELETE SET NULL,
  "timestamp" timestamptz NOT NULL,
  observed_timestamp timestamptz NOT NULL DEFAULT now(),
  operating_system text,
  hostname text,
  source_type text NOT NULL,
  service_name text,
  environment text,
  severity text NOT NULL DEFAULT 'INFO' CHECK (severity IN ('DEBUG','INFO','WARN','ERROR','CRITICAL')),
  event_category text,
  message text NOT NULL,
  raw_message text,
  client_ip text,
  username text,
  http_method text,
  http_status int,
  request_path text,
  response_time double precision,
  user_agent text,
  trace_id text,
  correlation_id text,
  attributes jsonb NOT NULL DEFAULT '{}',
  dedup_hash text NOT NULL,
  is_demo boolean NOT NULL DEFAULT false,
  UNIQUE (org_id, dedup_hash)
);
CREATE INDEX ON public.log_events (org_id, "timestamp" DESC);
CREATE INDEX ON public.log_events (org_id, severity, "timestamp" DESC);
CREATE INDEX ON public.log_events (org_id, source_type);
CREATE INDEX ON public.log_events (org_id, hostname);
CREATE INDEX ON public.log_events (org_id, http_status);

-- Alerts
CREATE TABLE public.alert_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  source_type text,
  min_severity text NOT NULL DEFAULT 'ERROR',
  message_contains text,
  http_status_min int,
  threshold int NOT NULL DEFAULT 10,
  window_minutes int NOT NULL DEFAULT 15,
  alert_severity text NOT NULL DEFAULT 'high' CHECK (alert_severity IN ('low','medium','high','critical')),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.alert_occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  rule_id uuid REFERENCES public.alert_rules(id) ON DELETE CASCADE,
  triggered_at timestamptz NOT NULL DEFAULT now(),
  event_count int NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved')),
  message text NOT NULL,
  is_demo boolean NOT NULL DEFAULT false
);
CREATE INDEX ON public.alert_occurrences (org_id, status);

-- AI analyses & saved queries
CREATE TABLE public.ai_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_id uuid REFERENCES public.log_events(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.saved_queries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  name text NOT NULL,
  filters jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Grants + RLS for org tables
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['servers','ingestion_jobs','log_events','alert_rules','alert_occurrences','ai_analyses','saved_queries'] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "org read" ON public.%I FOR SELECT TO authenticated USING (public.is_org_member(org_id))', t);
    EXECUTE format('CREATE POLICY "org insert" ON public.%I FOR INSERT TO authenticated WITH CHECK (public.can_write_org(org_id))', t);
    EXECUTE format('CREATE POLICY "org update" ON public.%I FOR UPDATE TO authenticated USING (public.can_write_org(org_id))', t);
    EXECUTE format('CREATE POLICY "org delete" ON public.%I FOR DELETE TO authenticated USING (public.can_write_org(org_id))', t);
  END LOOP;
END $$;

-- Signup: profile + org + admin membership
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _org uuid;
BEGIN
  INSERT INTO public.organizations (name)
  VALUES (COALESCE(NEW.raw_user_meta_data->>'org_name', split_part(NEW.email,'@',1) || ' — Organização'))
  RETURNING id INTO _org;
  INSERT INTO public.organization_members (org_id, user_id, role) VALUES (_org, NEW.id, 'admin');
  INSERT INTO public.profiles (id, full_name, default_org_id)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'), _org);
  INSERT INTO public.alert_rules (org_id, name, description, min_severity, threshold, window_minutes, alert_severity) VALUES
    (_org, 'Erros críticos', 'Qualquer evento CRITICAL na janela', 'CRITICAL', 1, 15, 'critical'),
    (_org, 'Pico de erros', 'Mais de 20 erros em 15 minutos', 'ERROR', 20, 15, 'high');
  INSERT INTO public.alert_rules (org_id, name, description, min_severity, message_contains, threshold, window_minutes, alert_severity) VALUES
    (_org, 'Falhas de autenticação', 'Mais de 5 falhas de login em 10 minutos', 'WARN', 'auth', 5, 10, 'medium');
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Alert evaluation
CREATE OR REPLACE FUNCTION public.evaluate_alerts(_org uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; c int; created int := 0; rank_min int;
BEGIN
  IF NOT public.is_org_member(_org) THEN RAISE EXCEPTION 'forbidden'; END IF;
  FOR r IN SELECT * FROM public.alert_rules WHERE org_id = _org AND enabled LOOP
    rank_min := array_position(ARRAY['DEBUG','INFO','WARN','ERROR','CRITICAL'], r.min_severity);
    SELECT count(*) INTO c FROM public.log_events e
    WHERE e.org_id = _org
      AND e.observed_timestamp > now() - make_interval(mins => r.window_minutes)
      AND array_position(ARRAY['DEBUG','INFO','WARN','ERROR','CRITICAL'], e.severity) >= rank_min
      AND (r.source_type IS NULL OR e.source_type = r.source_type)
      AND (r.message_contains IS NULL OR e.message ILIKE '%' || r.message_contains || '%' OR e.event_category ILIKE '%' || r.message_contains || '%')
      AND (r.http_status_min IS NULL OR e.http_status >= r.http_status_min);
    IF c >= r.threshold AND NOT EXISTS (
      SELECT 1 FROM public.alert_occurrences o WHERE o.rule_id = r.id AND o.status = 'open'
        AND o.triggered_at > now() - make_interval(mins => r.window_minutes)) THEN
      INSERT INTO public.alert_occurrences (org_id, rule_id, event_count, message)
      VALUES (_org, r.id, c, r.name || ': ' || c || ' eventos nos últimos ' || r.window_minutes || ' min');
      created := created + 1;
    END IF;
  END LOOP;
  RETURN created;
END $$;

-- Dashboard stats
CREATE OR REPLACE FUNCTION public.dashboard_stats(_org uuid, _since timestamptz, _bucket text DEFAULT 'hour')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE res jsonb;
BEGIN
  IF NOT public.is_org_member(_org) THEN RAISE EXCEPTION 'forbidden'; END IF;
  WITH ev AS (SELECT * FROM public.log_events WHERE org_id = _org AND "timestamp" >= _since)
  SELECT jsonb_build_object(
    'total_events', (SELECT count(*) FROM public.log_events WHERE org_id = _org),
    'events_24h', (SELECT count(*) FROM public.log_events WHERE org_id = _org AND "timestamp" >= now() - interval '24 hours'),
    'period_events', (SELECT count(*) FROM ev),
    'servers', (SELECT count(*) FROM public.servers WHERE org_id = _org),
    'servers_windows', (SELECT count(*) FROM public.servers WHERE org_id = _org AND os = 'windows'),
    'servers_linux', (SELECT count(*) FROM public.servers WHERE org_id = _org AND os = 'linux'),
    'errors', (SELECT count(*) FROM ev WHERE severity IN ('ERROR','CRITICAL')),
    'critical', (SELECT count(*) FROM ev WHERE severity = 'CRITICAL'),
    'active_alerts', (SELECT count(*) FROM public.alert_occurrences WHERE org_id = _org AND status <> 'resolved'),
    'auth_failures', (SELECT count(*) FROM ev WHERE event_category = 'auth_failure'),
    'last_ingest', (SELECT max(observed_timestamp) FROM public.log_events WHERE org_id = _org),
    'stale_sources', (SELECT count(*) FROM public.servers s WHERE org_id = _org AND (s.last_seen_at IS NULL OR s.last_seen_at < now() - interval '1 hour')),
    'timeline', COALESCE((SELECT jsonb_agg(t ORDER BY t.bucket) FROM (
        SELECT date_trunc(_bucket, "timestamp") AS bucket, count(*) AS total,
          count(*) FILTER (WHERE severity IN ('ERROR','CRITICAL')) AS errors,
          count(*) FILTER (WHERE severity = 'WARN') AS warnings
        FROM ev GROUP BY 1) t), '[]'),
    'by_severity', COALESCE((SELECT jsonb_agg(t) FROM (SELECT severity, count(*) AS count FROM ev GROUP BY 1) t), '[]'),
    'by_os', COALESCE((SELECT jsonb_agg(t) FROM (SELECT COALESCE(operating_system,'desconhecido') AS os, count(*) FILTER (WHERE severity IN ('ERROR','CRITICAL')) AS errors, count(*) AS total FROM ev GROUP BY 1) t), '[]'),
    'top_servers', COALESCE((SELECT jsonb_agg(t) FROM (SELECT hostname, count(*) AS errors FROM ev WHERE severity IN ('ERROR','CRITICAL') AND hostname IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 10) t), '[]'),
    'top_apps', COALESCE((SELECT jsonb_agg(t) FROM (SELECT COALESCE(service_name, source_type) AS app, count(*) AS errors FROM ev WHERE severity IN ('ERROR','CRITICAL') GROUP BY 1 ORDER BY 2 DESC LIMIT 10) t), '[]'),
    'http_classes', COALESCE((SELECT jsonb_agg(t ORDER BY t.class) FROM (SELECT (http_status/100)::text || 'xx' AS class, count(*) AS count FROM ev WHERE http_status IS NOT NULL GROUP BY 1) t), '[]'),
    'by_source', COALESCE((SELECT jsonb_agg(t) FROM (SELECT source_type, count(*) AS count FROM ev GROUP BY 1 ORDER BY 2 DESC) t), '[]'),
    'auth_timeline', COALESCE((SELECT jsonb_agg(t ORDER BY t.bucket) FROM (SELECT date_trunc(_bucket, "timestamp") AS bucket, count(*) AS count FROM ev WHERE event_category = 'auth_failure' GROUP BY 1) t), '[]'),
    'previous_period_events', (SELECT count(*) FROM public.log_events WHERE org_id = _org AND "timestamp" >= _since - (now() - _since) AND "timestamp" < _since),
    'previous_period_errors', (SELECT count(*) FROM public.log_events WHERE org_id = _org AND severity IN ('ERROR','CRITICAL') AND "timestamp" >= _since - (now() - _since) AND "timestamp" < _since)
  ) INTO res;
  RETURN res;
END $$;

-- Demo data
CREATE OR REPLACE FUNCTION public.clear_demo_data(_org uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_write_org(_org) THEN RAISE EXCEPTION 'forbidden'; END IF;
  DELETE FROM public.alert_occurrences WHERE org_id = _org AND is_demo;
  DELETE FROM public.log_events WHERE org_id = _org AND is_demo;
  DELETE FROM public.ingestion_jobs WHERE org_id = _org AND is_demo;
  DELETE FROM public.servers WHERE org_id = _org AND is_demo;
END $$;

CREATE OR REPLACE FUNCTION public.load_demo_data(_org uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  IF NOT public.can_write_org(_org) THEN RAISE EXCEPTION 'forbidden'; END IF;
  PERFORM public.clear_demo_data(_org);
  INSERT INTO public.servers (org_id, hostname, os, os_version, address, environment, owner, applications, services, tags, agent_status, last_seen_at, is_demo) VALUES
    (_org,'DEMO-WIN-PROD-01','windows','Windows Server 2022','10.0.1.10','production','Equipe Infra',ARRAY['Portal .NET'],ARRAY['IIS','IIS FTP','Windows Event Log'],ARRAY['demo','web'],'online',now(),true),
    (_org,'DEMO-WIN-PROD-02','windows','Windows Server 2019','10.0.1.11','production','Equipe Infra',ARRAY['ERP'],ARRAY['IIS','SQL Server'],ARRAY['demo'],'online',now() - interval '2 hours',true),
    (_org,'DEMO-LINUX-PROD-01','linux','Ubuntu 22.04','10.0.2.10','production','Equipe SRE',ARRAY['API Pagamentos'],ARRAY['Apache','Java Spring Boot','SSH'],ARRAY['demo','api'],'online',now(),true),
    (_org,'DEMO-LINUX-PROD-02','linux','Debian 12','10.0.2.11','production','Equipe SRE',ARRAY['Gateway'],ARRAY['Nginx','vsftpd'],ARRAY['demo','edge'],'online',now(),true),
    (_org,'DEMO-LINUX-HML-01','linux','Rocky Linux 9','10.0.3.10','staging','Equipe SRE',ARRAY['API Pagamentos'],ARRAY['Nginx','Java'],ARRAY['demo'],'online',now() - interval '3 hours',true);

  INSERT INTO public.log_events (org_id, server_id, "timestamp", operating_system, hostname, source_type, service_name, environment, severity, event_category, message, raw_message, client_ip, username, http_method, http_status, request_path, response_time, attributes, dedup_hash, is_demo)
  SELECT _org, s.id, ts, s.os, s.hostname, k.source_type, k.service, s.environment, k.severity, k.category,
    '[DEMO] ' || k.msg, '[DEMO-FICTÍCIO] ' || k.msg,
    k.ip, k.username, k.method, k.status, k.path, k.rt, jsonb_build_object('demo', true), md5(_org::text || g::text || k.kind || random()::text), true
  FROM generate_series(1, 1800) g
  CROSS JOIN LATERAL (SELECT now() - (random() * interval '7 days') * (CASE WHEN random() < 0.5 THEN 0.15 ELSE 1 END) AS ts, (g % 18) AS kind_i) x
  CROSS JOIN LATERAL (
    SELECT * FROM (VALUES
      (0,'iis','DEMO-WIN-PROD-01','iis_access','Portal .NET','ERROR','http_error','GET /api/pedidos 500 - Internal Server Error','203.0.113.' || (g%200),NULL::text,'GET',500,'/api/pedidos',1200 + random()*3000),
      (1,'iis','DEMO-WIN-PROD-01','iis_access','Portal .NET','WARN','http_error','GET /imagens/logo-antigo.png 404 - Not Found','198.51.100.' || (g%50),NULL,'GET',404,'/imagens/logo-antigo.png',12 + random()*30),
      (2,'iis','DEMO-WIN-PROD-01','iis_access','Portal .NET','INFO','http_request','GET /home 200','192.0.2.' || (g%250),NULL,'GET',200,'/home',40 + random()*200),
      (3,'iis','DEMO-WIN-PROD-02','iis_access','ERP','INFO','http_request','POST /erp/login 302','192.0.2.' || (g%250),NULL,'POST',302,'/erp/login',90 + random()*100),
      (4,'win','DEMO-WIN-PROD-01','windows_event','Service Control Manager','ERROR','service_failure','Event 7034: O serviço "Spooler de Impressão" foi encerrado inesperadamente.',NULL,NULL,NULL,NULL,NULL,NULL),
      (5,'win','DEMO-WIN-PROD-02','windows_event','Microsoft-Windows-Security-Auditing','WARN','auth_failure','Event 4625: Falha de logon para a conta "administrador".','198.51.100.77','administrador',NULL,NULL,NULL,NULL),
      (6,'ftp','DEMO-WIN-PROD-01','iis_ftp','IIS FTP','WARN','auth_failure','FTP PASS 530 - Falha de autenticação do usuário "ftpuser"','203.0.113.45','ftpuser',NULL,NULL,NULL,NULL),
      (7,'apache','DEMO-LINUX-PROD-01','apache_access','Apache','WARN','http_error','GET /.env 403 Forbidden','203.0.113.66',NULL,'GET',403,'/.env',3 + random()*5),
      (8,'apache','DEMO-LINUX-PROD-01','apache_access','Apache','INFO','http_request','GET /api/status 200','192.0.2.' || (g%250),NULL,'GET',200,'/api/status',15 + random()*40),
      (9,'apache','DEMO-LINUX-PROD-01','apache_access','Apache','INFO','http_request','POST /api/pagamentos 201','192.0.2.' || (g%250),NULL,'POST',201,'/api/pagamentos',120 + random()*200),
      (10,'nginx','DEMO-LINUX-PROD-02','nginx_error','Nginx','ERROR','upstream_timeout','upstream timed out (110: Connection timed out) while reading response header from upstream','198.51.100.' || (g%50),NULL,'GET',504,'/api/pagamentos',60000),
      (11,'nginx','DEMO-LINUX-PROD-02','nginx_access','Nginx','INFO','http_request','GET /checkout 200','192.0.2.' || (g%250),NULL,'GET',200,'/checkout',80 + random()*300),
      (12,'nginx','DEMO-LINUX-PROD-02','nginx_access','Nginx','INFO','http_request','GET /static/app.js 304','192.0.2.' || (g%250),NULL,'GET',304,'/static/app.js',2 + random()*5),
      (13,'java','DEMO-LINUX-PROD-01','java_app','API Pagamentos','ERROR','exception','java.lang.NullPointerException: Cannot invoke "Cliente.getId()" because "cliente" is null at br.demo.pagamentos.Service.processar(Service.java:87)',NULL,NULL,NULL,NULL,NULL,NULL),
      (14,'java','DEMO-LINUX-HML-01','java_app','API Pagamentos','CRITICAL','exception','java.lang.OutOfMemoryError: Java heap space',NULL,NULL,NULL,NULL,NULL,NULL),
      (15,'ssh','DEMO-LINUX-PROD-01','linux_auth','sshd','WARN','auth_failure','Failed password for invalid user admin from 203.0.113.99 port 52144 ssh2','203.0.113.99','admin',NULL,NULL,NULL,NULL),
      (16,'ftpl','DEMO-LINUX-PROD-02','vsftpd','vsftpd','ERROR','transfer_failure','FAIL UPLOAD: Client "198.51.100.20", "/upload/relatorio.csv", 0.00Kbyte/sec','198.51.100.20','backup',NULL,NULL,NULL,NULL),
      (17,'sys','DEMO-LINUX-PROD-02','syslog','systemd','INFO','system','Started Daily apt upgrade and clean activities.',NULL,NULL,NULL,NULL,NULL,NULL)
    ) v(i, kind, host, source_type, service, severity, category, msg, ip, username, method, status, path, rt)
    WHERE v.i = x.kind_i
  ) k
  JOIN public.servers s ON s.org_id = _org AND s.hostname = k.host;
  GET DIAGNOSTICS n = ROW_COUNT;

  INSERT INTO public.ingestion_jobs (org_id, file_name, log_type, status, lines_total, lines_imported, is_demo)
  VALUES (_org, 'dados-demonstracao (fictício)', 'demo', 'completed', n, n, true);
  INSERT INTO public.alert_occurrences (org_id, rule_id, event_count, message, is_demo)
  SELECT _org, id, 12, '[DEMO] ' || name || ': 12 eventos detectados', true FROM public.alert_rules WHERE org_id = _org AND enabled LIMIT 2;
  RETURN n;
END $$;

REVOKE EXECUTE ON FUNCTION public.load_demo_data(uuid), public.clear_demo_data(uuid), public.evaluate_alerts(uuid), public.dashboard_stats(uuid, timestamptz, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.load_demo_data(uuid), public.clear_demo_data(uuid), public.evaluate_alerts(uuid), public.dashboard_stats(uuid, timestamptz, text), public.is_org_member(uuid), public.can_write_org(uuid), public.is_org_admin(uuid) TO authenticated;
