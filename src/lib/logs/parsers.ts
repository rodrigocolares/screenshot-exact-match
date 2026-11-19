// @ts-nocheck -- regex-group heavy parser; behavior is covered by parsers.test.ts
// Real log parsers for LogSentinel. Fields absent from the source stay null — never invented.
export type Severity = "DEBUG" | "INFO" | "WARN" | "ERROR" | "CRITICAL";

export type LogType =
  | "auto"
  | "iis_access"
  | "iis_ftp"
  | "apache_access"
  | "apache_error"
  | "nginx_access"
  | "nginx_error"
  | "java_app"
  | "linux_auth"
  | "syslog"
  | "vsftpd"
  | "json"
  | "generic";

export const LOG_TYPES: { value: LogType; label: string; os: "windows" | "linux" | "any" }[] = [
  { value: "auto", label: "Detectar automaticamente", os: "any" },
  { value: "iis_access", label: "IIS W3C (acesso)", os: "windows" },
  { value: "iis_ftp", label: "IIS FTP (W3C)", os: "windows" },
  { value: "apache_access", label: "Apache Access (Common/Combined)", os: "linux" },
  { value: "apache_error", label: "Apache Error", os: "linux" },
  { value: "nginx_access", label: "Nginx Access", os: "linux" },
  { value: "nginx_error", label: "Nginx Error", os: "linux" },
  { value: "java_app", label: "Java (Logback / Log4j / Spring)", os: "any" },
  { value: "linux_auth", label: "Linux auth.log / secure (SSH, sudo)", os: "linux" },
  { value: "syslog", label: "Syslog", os: "linux" },
  { value: "vsftpd", label: "vsftpd (FTP Linux)", os: "linux" },
  { value: "json", label: "JSON por linha", os: "any" },
  { value: "generic", label: "Texto genérico", os: "any" },
];

export interface ParsedEvent {
  timestamp: string; // ISO
  source_type: string;
  service_name: string | null;
  severity: Severity;
  event_category: string | null;
  message: string;
  raw_message: string;
  client_ip: string | null;
  username: string | null;
  http_method: string | null;
  http_status: number | null;
  request_path: string | null;
  response_time: number | null;
  user_agent: string | null;
  attributes: Record<string, unknown>;
}

export interface ParseResult {
  detected: LogType;
  events: ParsedEvent[];
  total: number;
  rejected: { line: number; reason: string; raw: string }[];
}

const MONTHS: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

function base(source: string, raw: string): ParsedEvent {
  return {
    timestamp: "",
    source_type: source,
    service_name: null,
    severity: "INFO",
    event_category: null,
    message: raw,
    raw_message: raw,
    client_ip: null,
    username: null,
    http_method: null,
    http_status: null,
    request_path: null,
    response_time: null,
    user_agent: null,
    attributes: {},
  };
}

const nul = (v: string | undefined) => (v === undefined || v === "-" || v === "" ? null : v);

export function severityFromHttp(status: number | null): Severity {
  if (status === null) return "INFO";
  if (status >= 500) return "ERROR";
  if (status >= 400) return "WARN";
  return "INFO";
}

export function normalizeSeverity(level: string | undefined | null): Severity {
  const l = (level ?? "").toUpperCase();
  if (["FATAL", "CRIT", "CRITICAL", "EMERG", "ALERT", "SEVERE"].includes(l)) return "CRITICAL";
  if (["ERROR", "ERR"].includes(l)) return "ERROR";
  if (["WARN", "WARNING"].includes(l)) return "WARN";
  if (["DEBUG", "TRACE", "VERBOSE"].includes(l)) return "DEBUG";
  return "INFO";
}

function categoryFromHttp(status: number | null): string | null {
  if (status === null) return null;
  if (status === 401) return "auth_failure";
  return status >= 400 ? "http_error" : "http_request";
}

const SENSITIVE = /(\.env|\.git\/|wp-login|phpmyadmin|\/etc\/passwd|\.\.\/|union\s+select|<script|cmd\.exe|xmlrpc\.php)/i;

function securityTag(ev: ParsedEvent) {
  const target = `${ev.request_path ?? ""} ${ev.message}`;
  if (SENSITIVE.test(target)) {
    ev.attributes.suspicious = true;
    if (ev.event_category === "http_request" || ev.event_category === "http_error") ev.event_category = "suspicious_request";
  }
}

// Apache/Nginx "18/Nov/2026:20:00:00 -0300"
function parseClfDate(s: string): string | null {
  const m = s.match(/^(\d{2})\/(\w{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2})\s*([+-]\d{4})?$/);
  if (!m) return null;
  const [, d, mon, y, hh, mm, ss, tz] = m;
  const off = tz ? `${tz.slice(0, 3)}:${tz.slice(3)}` : "Z";
  const iso = `${y}-${String(MONTHS[mon] + 1).padStart(2, "0")}-${d}T${hh}:${mm}:${ss}${off}`;
  const t = new Date(iso);
  return isNaN(t.getTime()) ? null : t.toISOString();
}

// Syslog "Nov 18 20:00:00" — no year in the source; assume the reference year.
function parseSyslogDate(s: string, ref: Date): string | null {
  const m = s.match(/^(\w{3})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (!m || MONTHS[m[1]] === undefined) return null;
  const d = new Date(Date.UTC(ref.getUTCFullYear(), MONTHS[m[1]], +m[2], +m[3], +m[4], +m[5]));
  if (d.getTime() > ref.getTime() + 86400000) d.setUTCFullYear(d.getUTCFullYear() - 1);
  return d.toISOString();
}

function parseIsoish(s: string): string | null {
  const t = new Date(s.replace(",", ".").replace(" ", "T"));
  return isNaN(t.getTime()) ? null : t.toISOString();
}

// ---------- IIS W3C (also IIS FTP) ----------
function parseW3C(lines: string[], source: "iis_access" | "iis_ftp"): ParseResult {
  let fields: string[] = [];
  const events: ParsedEvent[] = [];
  const rejected: ParseResult["rejected"] = [];
  let total = 0;
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    if (line.startsWith("#")) {
      if (line.startsWith("#Fields:")) fields = line.slice(8).trim().split(/\s+/);
      return;
    }
    total++;
    if (!fields.length) {
      rejected.push({ line: i + 1, reason: "Linha sem cabeçalho #Fields anterior", raw: line });
      return;
    }
    const parts = line.trim().split(/\s+/);
    if (parts.length !== fields.length) {
      rejected.push({ line: i + 1, reason: `Esperados ${fields.length} campos, encontrados ${parts.length}`, raw: line });
      return;
    }
    const f: Record<string, string> = {};
    fields.forEach((k, idx) => (f[k] = parts[idx]));
    const ev = base(source, line);
    const ts = f["date"] && f["time"] ? parseIsoish(`${f["date"]}T${f["time"]}Z`) : null;
    if (!ts) {
      rejected.push({ line: i + 1, reason: "Data/hora inválida", raw: line });
      return;
    }
    ev.timestamp = ts;
    ev.client_ip = nul(f["c-ip"]);
    ev.username = nul(f["cs-username"]);
    ev.user_agent = nul(f["cs(User-Agent)"])?.replace(/\+/g, " ") ?? null;
    ev.service_name = source === "iis_ftp" ? "IIS FTP" : nul(f["s-sitename"]) ?? "IIS";
    const status = nul(f["sc-status"]);
    if (source === "iis_access") {
      ev.http_method = nul(f["cs-method"]);
      ev.request_path = nul(f["cs-uri-stem"]);
      ev.http_status = status ? Number(status) : null;
      ev.response_time = f["time-taken"] ? Number(f["time-taken"]) : null;
      ev.severity = severityFromHttp(ev.http_status);
      ev.event_category = categoryFromHttp(ev.http_status);
      ev.message = `${ev.http_method ?? ""} ${ev.request_path ?? ""} ${ev.http_status ?? ""}`.trim();
    } else {
      const cmd = nul(f["cs-method"]);
      const code = status ? Number(status) : null;
      ev.http_method = null;
      ev.request_path = nul(f["cs-uri-stem"]);
      ev.attributes.ftp_command = cmd;
      ev.attributes.ftp_status = code;
      ev.severity = code !== null && code >= 500 ? (code === 530 ? "WARN" : "ERROR") : "INFO";
      ev.event_category = code === 530 ? "auth_failure" : code !== null && code >= 400 ? "transfer_failure" : "ftp_activity";
      ev.message = `FTP ${cmd ?? ""} ${ev.request_path ?? ""} ${code ?? ""}`.replace(/\s+/g, " ").trim();
    }
    if (f["sc-substatus"]) ev.attributes.substatus = Number(f["sc-substatus"]);
    if (f["sc-win32-status"]) ev.attributes.win32_status = Number(f["sc-win32-status"]);
    if (f["cs-uri-query"] && f["cs-uri-query"] !== "-") ev.attributes.query = f["cs-uri-query"];
    if (f["s-ip"]) ev.attributes.server_ip = f["s-ip"];
    if (f["s-port"]) ev.attributes.server_port = Number(f["s-port"]);
    securityTag(ev);
    events.push(ev);
  });
  return { detected: source, events, total, rejected };
}

// ---------- Apache / Nginx access (common, combined, + optional trailing fields) ----------
const CLF =
  /^(\S+) (\S+) (\S+) \[([^\]]+)\] "([^"]*)" (\d{3}|-) (\d+|-)(?: "([^"]*)" "([^"]*)")?(.*)$/;

function parseAccess(lines: string[], source: "apache_access" | "nginx_access"): ParseResult {
  const events: ParsedEvent[] = [];
  const rejected: ParseResult["rejected"] = [];
  let total = 0;
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    total++;
    // Optional leading vhost (Apache %v:%p or vhost_combined)
    let vhost: string | null = null;
    let l = line;
    const vh = line.match(/^(\S+:\d+) (.*)$/);
    if (vh && !CLF.test(line)) {
      vhost = vh[1];
      l = vh[2];
    }
    const m = l.match(CLF);
    if (!m) {
      rejected.push({ line: i + 1, reason: "Formato de acesso não reconhecido", raw: line });
      return;
    }
    const [, ip, , user, date, req, status, bytes, referer, ua, rest] = m;
    const ts = parseClfDate(date);
    if (!ts) {
      rejected.push({ line: i + 1, reason: "Data inválida", raw: line });
      return;
    }
    const ev = base(source, line);
    ev.timestamp = ts;
    ev.client_ip = nul(ip);
    ev.username = nul(user);
    const [method, path, proto] = req.split(" ");
    ev.http_method = nul(method);
    ev.request_path = nul(path);
    if (proto) ev.attributes.protocol = proto;
    ev.http_status = status === "-" ? null : Number(status);
    if (bytes !== "-") ev.attributes.bytes = Number(bytes);
    if (referer && referer !== "-") ev.attributes.referer = referer;
    ev.user_agent = nul(ua);
    if (vhost) ev.attributes.vhost = vhost;
    ev.service_name = source === "nginx_access" ? "Nginx" : "Apache";
    // Trailing extras, e.g. nginx: rt=0.123 uct="0.001" urt="0.120" us=502 or plain request_time number
    const extra = (rest ?? "").trim();
    if (extra) {
      const kv = [...extra.matchAll(/(\w+)=("?)([^"\s]*)\2/g)];
      for (const [, k, , v] of kv) {
        if (k === "rt" || k === "request_time") ev.response_time = Number(v) * 1000;
        else if (k === "urt" || k === "upstream_response_time") ev.attributes.upstream_response_time = v;
        else if (k === "us" || k === "upstream_status") ev.attributes.upstream_status = v;
        else ev.attributes[k] = v;
      }
      if (!kv.length && /^\d+(\.\d+)?$/.test(extra)) {
        // Apache %D (microseconds) is an integer; nginx $request_time is seconds with a dot.
        ev.response_time = extra.includes(".") ? Number(extra) * 1000 : Number(extra) / 1000;
      }
    }
    ev.severity = severityFromHttp(ev.http_status);
    ev.event_category = categoryFromHttp(ev.http_status);
    if (ev.http_status === 429) ev.event_category = "rate_limit";
    ev.message = `${ev.http_method ?? ""} ${ev.request_path ?? ""} ${ev.http_status ?? ""}`.trim();
    securityTag(ev);
    events.push(ev);
  });
  return { detected: source, events, total, rejected };
}

// ---------- Apache error ----------
// [Wed Nov 18 20:00:00.123456 2026] [core:error] [pid 123] [client 1.2.3.4:5678] AH00126: msg
const APACHE_ERR = /^\[(\w{3}) (\w{3}) (\d{1,2}) (\d{2}:\d{2}:\d{2})(?:\.\d+)? (\d{4})\] \[(?:(\w+):)?(\w+)\](?: \[pid (\d+)(?::tid \d+)?\])?(?: \[client ([^\]]+)\])? (.*)$/;
function parseApacheError(lines: string[]): ParseResult {
  const events: ParsedEvent[] = [];
  const rejected: ParseResult["rejected"] = [];
  let total = 0;
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    total++;
    const m = line.match(APACHE_ERR);
    if (!m) {
      rejected.push({ line: i + 1, reason: "Formato Apache error não reconhecido", raw: line });
      return;
    }
    const [, , mon, d, time, y, mod, level, pid, client, msg] = m;
    const ev = base("apache_error", line);
    ev.timestamp = new Date(`${y}-${String(MONTHS[mon] + 1).padStart(2, "0")}-${d.padStart(2, "0")}T${time}Z`).toISOString();
    ev.severity = normalizeSeverity(level === "notice" ? "info" : level);
    ev.service_name = "Apache";
    ev.client_ip = client ? client.replace(/:\d+$/, "") : null;
    ev.message = msg;
    ev.event_category = /denied|forbidden/i.test(msg) ? "access_denied" : "server_error";
    if (mod) ev.attributes.module = mod;
    if (pid) ev.attributes.pid = Number(pid);
    events.push(ev);
  });
  return { detected: "apache_error", events, total, rejected };
}

// ---------- Nginx error ----------
// 2026/11/18 20:00:00 [error] 123#0: *45 upstream timed out ..., client: 1.2.3.4, server: x, request: "GET / HTTP/1.1", upstream: "..."
const NGINX_ERR = /^(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}) \[(\w+)\] (\d+)#(\d+): (?:\*(\d+) )?(.*)$/;
function parseNginxError(lines: string[]): ParseResult {
  const events: ParsedEvent[] = [];
  const rejected: ParseResult["rejected"] = [];
  let total = 0;
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    total++;
    const m = line.match(NGINX_ERR);
    if (!m) {
      rejected.push({ line: i + 1, reason: "Formato Nginx error não reconhecido", raw: line });
      return;
    }
    const [, date, level, pid, , conn, msg] = m;
    const ev = base("nginx_error", line);
    ev.timestamp = new Date(date.replace(/\//g, "-").replace(" ", "T") + "Z").toISOString();
    ev.severity = normalizeSeverity(level === "crit" ? "critical" : level === "emerg" || level === "alert" ? "critical" : level);
    ev.service_name = "Nginx";
    ev.attributes.pid = Number(pid);
    if (conn) ev.attributes.connection = Number(conn);
    const client = msg.match(/client: ([^,]+)/);
    ev.client_ip = client ? client[1] : null;
    const req = msg.match(/request: "(\S+) (\S+)/);
    if (req) {
      ev.http_method = req[1];
      ev.request_path = req[2];
    }
    const up = msg.match(/upstream: "([^"]+)"/);
    if (up) ev.attributes.upstream = up[1];
    const host = msg.match(/server: ([^,]+)/);
    if (host) ev.attributes.server_name = host[1];
    ev.message = msg.split(", client:")[0];
    ev.event_category = /timed out/i.test(msg)
      ? "upstream_timeout"
      : /refused/i.test(msg)
        ? "connection_refused"
        : /limiting requests/i.test(msg)
          ? "rate_limit"
          : /upstream/i.test(msg)
            ? "proxy_error"
            : "server_error";
    events.push(ev);
  });
  return { detected: "nginx_error", events, total, rejected };
}

// ---------- Java (Logback / Log4j / Spring Boot), multiline stack traces ----------
// 2026-11-18 20:00:00.123 ERROR 1234 --- [main] c.e.Foo : msg
// 2026-11-18 20:00:00,123 [main] ERROR com.example.Foo - msg
// 2026-11-18T20:00:00.123Z  ERROR 1 --- [app] [nio-8080-exec-1] c.e.Foo : msg
const JAVA_START = /^(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:[.,]\d{1,6})?(?:Z|[+-]\d{2}:?\d{2})?)\s+(.*)$/;
const LEVEL_RE = /\b(TRACE|DEBUG|INFO|WARN|WARNING|ERROR|FATAL|SEVERE)\b/;
function parseJava(lines: string[]): ParseResult {
  const events: ParsedEvent[] = [];
  const rejected: ParseResult["rejected"] = [];
  let total = 0;
  let cur: { ev: ParsedEvent; extra: string[] } | null = null;
  const flush = () => {
    if (!cur) return;
    const { ev, extra } = cur;
    if (extra.length) {
      ev.raw_message += "\n" + extra.join("\n");
      ev.attributes.stack_trace = extra.join("\n");
      const exLine = extra.find((l) => /^(Caused by: )?[\w$.]+(Exception|Error)\b/.test(l.trim()));
      if (exLine) ev.attributes.exception = exLine.trim().replace(/^Caused by: /, "").split(":")[0];
    }
    const exMsg = ev.message.match(/([\w$.]+(?:Exception|Error))\b/);
    if (!ev.attributes.exception && exMsg) ev.attributes.exception = exMsg[1];
    const exc = String(ev.attributes.exception ?? "");
    if (exc) {
      ev.event_category = "exception";
      if (/OutOfMemoryError|StackOverflowError/.test(exc)) ev.severity = "CRITICAL";
    }
    events.push(ev);
    cur = null;
  };
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    const m = line.match(JAVA_START);
    if (m) {
      flush();
      total++;
      const ts = parseIsoish(m[1].replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
      if (!ts) {
        rejected.push({ line: i + 1, reason: "Data inválida", raw: line });
        return;
      }
      const body = m[2];
      const lvl = body.match(LEVEL_RE);
      const ev = base("java_app", line);
      ev.timestamp = ts;
      ev.severity = normalizeSeverity(lvl?.[1]);
      const thread = body.match(/\[([^\]]+)\]/);
      if (thread) ev.attributes.thread = thread[1];
      const logger = body.match(/(?:---.*?\]\s+|\]\s+(?:\w+\s+)?)([\w$.]+)\s+[:-]\s+(.*)$/) ?? body.match(/([\w$.]{3,})\s+[:-]\s+(.*)$/);
      if (logger) {
        ev.attributes.logger = logger[1];
        ev.message = logger[2];
      } else {
        ev.message = body.replace(LEVEL_RE, "").trim();
      }
      ev.service_name = "Java";
      cur = { ev, extra: [] };
    } else if (cur) {
      cur.extra.push(line);
    } else {
      total++;
      rejected.push({ line: i + 1, reason: "Linha de continuação sem evento inicial", raw: line });
    }
  });
  flush();
  return { detected: "java_app", events, total, rejected };
}

// ---------- Syslog / auth.log / vsftpd ----------
const SYSLOG = /^(\w{3}\s+\d{1,2} \d{2}:\d{2}:\d{2}) (\S+) ([\w./-]+)(?:\[(\d+)\])?: (.*)$/;
const SYSLOG_ISO = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})) (\S+) ([\w./-]+)(?:\[(\d+)\])?: (.*)$/;
function parseSyslog(lines: string[], source: "syslog" | "linux_auth", ref: Date): ParseResult {
  const events: ParsedEvent[] = [];
  const rejected: ParseResult["rejected"] = [];
  let total = 0;
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    total++;
    const m = line.match(SYSLOG) ?? line.match(SYSLOG_ISO);
    if (!m) {
      rejected.push({ line: i + 1, reason: "Formato syslog não reconhecido", raw: line });
      return;
    }
    const [, date, host, prog, pid, msg] = m;
    const ts = /^\d{4}/.test(date) ? parseIsoish(date) : parseSyslogDate(date.replace(/\s+/g, " "), ref);
    if (!ts) {
      rejected.push({ line: i + 1, reason: "Data inválida", raw: line });
      return;
    }
    const ev = base(source, line);
    ev.timestamp = ts;
    ev.service_name = prog;
    ev.message = msg;
    ev.attributes.syslog_host = host;
    if (pid) ev.attributes.pid = Number(pid);
    const failed = msg.match(/Failed (?:password|publickey) for (?:invalid user )?(\S+) from (\S+)/);
    const accepted = msg.match(/Accepted \S+ for (\S+) from (\S+)/);
    const invalid = msg.match(/Invalid user (\S+) from (\S+)/);
    const sudo = msg.match(/^\s*(\S+) : .*COMMAND=(.*)$/);
    if (failed || invalid || /authentication failure/i.test(msg)) {
      const mm = failed ?? invalid;
      ev.username = mm?.[1] ?? msg.match(/user=(\S+)/)?.[1] ?? null;
      ev.client_ip = mm?.[2] ?? msg.match(/rhost=(\S+)/)?.[1] ?? null;
      ev.severity = "WARN";
      ev.event_category = "auth_failure";
    } else if (accepted) {
      ev.username = accepted[1];
      ev.client_ip = accepted[2];
      ev.event_category = "auth_success";
    } else if (sudo && prog === "sudo") {
      ev.username = sudo[1];
      ev.event_category = "privilege_escalation";
      ev.attributes.command = sudo[2];
    } else if (/out of memory|oom-killer|Killed process/i.test(msg)) {
      ev.severity = "CRITICAL";
      ev.event_category = "oom";
    } else if (/\b(error|failed|failure)\b/i.test(msg)) {
      ev.severity = "ERROR";
      ev.event_category = "system_error";
    } else if (/\bwarn(ing)?\b/i.test(msg)) {
      ev.severity = "WARN";
    } else ev.event_category = "system";
    events.push(ev);
  });
  return { detected: source, events, total, rejected };
}

// vsftpd: Wed Nov 18 20:00:00 2026 [pid 1234] [user] OK LOGIN: Client "1.2.3.4"
const VSFTPD = /^\w{3} (\w{3})\s+(\d{1,2}) (\d{2}:\d{2}:\d{2}) (\d{4}) \[pid (\d+)\] (?:\[([^\]]+)\] )?(OK|FAIL) (\w[\w ]*?): Client "([^"]+)"(?:, "([^"]+)")?(.*)$/;
function parseVsftpd(lines: string[]): ParseResult {
  const events: ParsedEvent[] = [];
  const rejected: ParseResult["rejected"] = [];
  let total = 0;
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    total++;
    const m = line.match(VSFTPD);
    if (!m) {
      rejected.push({ line: i + 1, reason: "Formato vsftpd não reconhecido", raw: line });
      return;
    }
    const [, mon, d, time, y, pid, user, result, action, client, file, rest] = m;
    const ev = base("vsftpd", line);
    ev.timestamp = new Date(`${y}-${String(MONTHS[mon] + 1).padStart(2, "0")}-${d.padStart(2, "0")}T${time}Z`).toISOString();
    ev.service_name = "vsftpd";
    ev.username = nul(user);
    ev.client_ip = client.replace(/^::ffff:/, "");
    ev.request_path = file ?? null;
    ev.attributes.pid = Number(pid);
    ev.attributes.ftp_action = action;
    if (rest?.trim()) ev.attributes.details = rest.replace(/^,\s*/, "").trim();
    const isLogin = /LOGIN/.test(action);
    if (result === "FAIL") {
      ev.severity = isLogin ? "WARN" : "ERROR";
      ev.event_category = isLogin ? "auth_failure" : "transfer_failure";
    } else ev.event_category = isLogin ? "auth_success" : "ftp_activity";
    ev.message = `${result} ${action}${file ? ` ${file}` : ""}`;
    events.push(ev);
  });
  return { detected: "vsftpd", events, total, rejected };
}

// ---------- JSON lines ----------
function parseJsonLines(lines: string[]): ParseResult {
  const events: ParsedEvent[] = [];
  const rejected: ParseResult["rejected"] = [];
  let total = 0;
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    total++;
    let o: Record<string, unknown>;
    try {
      o = JSON.parse(line);
    } catch {
      rejected.push({ line: i + 1, reason: "JSON inválido", raw: line });
      return;
    }
    const pick = (...keys: string[]) => {
      for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== "") return o[k];
      return undefined;
    };
    const tsRaw = pick("timestamp", "@timestamp", "time", "ts", "date");
    const ts = tsRaw !== undefined ? (typeof tsRaw === "number" ? new Date(tsRaw > 1e12 ? tsRaw : tsRaw * 1000).toISOString() : parseIsoish(String(tsRaw))) : null;
    if (!ts) {
      rejected.push({ line: i + 1, reason: "Campo de data ausente ou inválido", raw: line });
      return;
    }
    const ev = base("json", line);
    ev.timestamp = ts;
    ev.message = String(pick("message", "msg", "log") ?? line);
    const status = pick("status", "http_status", "status_code");
    ev.http_status = status !== undefined && !isNaN(Number(status)) ? Number(status) : null;
    const lvl = pick("level", "severity", "log.level", "loglevel");
    ev.severity = lvl !== undefined ? normalizeSeverity(String(lvl)) : severityFromHttp(ev.http_status);
    ev.service_name = (pick("service", "service_name", "logger", "app") as string | undefined) ?? null;
    ev.client_ip = (pick("client_ip", "ip", "remote_addr") as string | undefined) ?? null;
    ev.username = (pick("user", "username") as string | undefined) ?? null;
    ev.http_method = (pick("method", "http_method") as string | undefined) ?? null;
    ev.request_path = (pick("path", "url", "request_path", "uri") as string | undefined) ?? null;
    const rt = pick("response_time", "duration_ms", "request_time");
    ev.response_time = rt !== undefined && !isNaN(Number(rt)) ? Number(rt) : null;
    if (/(Exception|Error)\b/.test(ev.message)) ev.event_category = "exception";
    else ev.event_category = categoryFromHttp(ev.http_status);
    ev.attributes = o;
    events.push(ev);
  });
  return { detected: "json", events, total, rejected };
}

function parseGeneric(lines: string[]): ParseResult {
  const events: ParsedEvent[] = [];
  const rejected: ParseResult["rejected"] = [];
  let total = 0;
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    total++;
    const tsm = line.match(/(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?)/);
    const ts = tsm ? parseIsoish(tsm[1]) : null;
    if (!ts) {
      rejected.push({ line: i + 1, reason: "Nenhuma data reconhecida na linha", raw: line });
      return;
    }
    const ev = base("generic", line);
    ev.timestamp = ts;
    ev.severity = normalizeSeverity(line.match(LEVEL_RE)?.[1]);
    events.push(ev);
  });
  return { detected: "generic", events, total, rejected };
}

export function detectLogType(sample: string[]): LogType {
  const lines = sample.filter((l) => l.trim()).slice(0, 30);
  const joined = lines.join("\n");
  if (/^#Fields:/m.test(joined)) {
    return /#Software: Microsoft Internet Information Services.*FTP|x-session|\bFTP\b/i.test(joined) && !/cs-uri-query/.test(joined) ? "iis_ftp" : "iis_access";
  }
  const first = lines[0] ?? "";
  if (first.startsWith("{")) return "json";
  if (VSFTPD.test(first)) return "vsftpd";
  if (NGINX_ERR.test(first)) return "nginx_error";
  if (APACHE_ERR.test(first)) return "apache_error";
  const vhostAccess = first.match(/^\S+:\d+ (.*)$/);
  if (CLF.test(first) || (vhostAccess && CLF.test(vhostAccess[1]))) {
    return /\b(rt|urt|uct|us|upstream_\w+)=/.test(joined) || /nginx/i.test(joined) ? "nginx_access" : "apache_access";
  }
  if (SYSLOG.test(first) || SYSLOG_ISO.test(first)) {
    return /sshd|sudo|pam_unix|authentication/i.test(joined) ? "linux_auth" : "syslog";
  }
  if (JAVA_START.test(first) && LEVEL_RE.test(first)) return "java_app";
  return "generic";
}

export function parseLogs(content: string, type: LogType = "auto", ref: Date = new Date()): ParseResult {
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/);
  const t = type === "auto" ? detectLogType(lines) : type;
  switch (t) {
    case "iis_access":
    case "iis_ftp":
      return parseW3C(lines, t);
    case "apache_access":
    case "nginx_access":
      return parseAccess(lines, t);
    case "apache_error":
      return parseApacheError(lines);
    case "nginx_error":
      return parseNginxError(lines);
    case "java_app":
      return parseJava(lines);
    case "linux_auth":
    case "syslog":
      return parseSyslog(lines, t, ref);
    case "vsftpd":
      return parseVsftpd(lines);
    case "json":
      return parseJsonLines(lines);
    default:
      return parseGeneric(lines);
  }
}
