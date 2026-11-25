import { z } from "zod";

export const SOURCE_OPTIONS = [
  { value: "iis_access", label: "IIS Access W3C", os: "windows", path: "C:/inetpub/logs/LogFiles/W3SVC*/u_ex*.log" },
  { value: "iis_ftp", label: "IIS FTP W3C", os: "windows", path: "C:/inetpub/logs/LogFiles/FTPSVC*/u_ex*.log" },
  { value: "windows_event", label: "Windows Event Log", os: "windows", path: "Application,System" },
  { value: "apache_access", label: "Apache Access", os: "linux", path: "/var/log/apache2/access.log" },
  { value: "apache_error", label: "Apache Error", os: "linux", path: "/var/log/apache2/error.log" },
  { value: "nginx_access", label: "Nginx Access", os: "linux", path: "/var/log/nginx/access.log" },
  { value: "nginx_error", label: "Nginx Error", os: "linux", path: "/var/log/nginx/error.log" },
  { value: "java_app", label: "Java / Spring / Tomcat", os: "any", path: "/var/log/app/application.log" },
  { value: "linux_auth", label: "SSH / sudo / auth", os: "linux", path: "/var/log/auth.log" },
  { value: "syslog", label: "Syslog", os: "linux", path: "/var/log/syslog" },
  { value: "journald", label: "Journald / systemd", os: "linux", path: "/var/log/journal" },
  { value: "vsftpd", label: "vsftpd", os: "linux", path: "/var/log/vsftpd.log" },
  { value: "json", label: "JSON / Docker JSON / Python / Node.js", os: "any", path: "/var/log/app/*.json" },
  { value: "generic", label: ".NET / ASP.NET / FTP personalizado / texto", os: "any", path: "/var/log/app/*.log" },
] as const;

export const sourceSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(["iis_access", "iis_ftp", "windows_event", "apache_access", "apache_error", "nginx_access", "nginx_error", "java_app", "linux_auth", "syslog", "journald", "vsftpd", "json", "generic"]),
  path: z.string().trim().min(1).max(1000).refine(s => !/[\r\n\u0000"]/.test(s) && !s.includes("${"), "Caminho inválido"),
});
export const collectorSchema = z.object({
  orgId: z.string().uuid(), id: z.string().uuid().optional(), serverId: z.string().uuid(), apiKeyId: z.string().uuid(),
  name: z.string().trim().min(1).max(100), version: z.literal("5.0.7"),
  sources: z.array(sourceSchema).min(1).max(20),
});
export type Source = z.infer<typeof sourceSchema>;
const COLLECTOR_ORIGINS = ["https://pixel-perfect-recreation-2056.lovable.app", "https://id-preview--ad665671-fa22-492f-89a7-2436ca487828.lovable.app", "https://project--ad665671-fa22-492f-89a7-2436ca487828.lovable.app", "https://project--ad665671-fa22-492f-89a7-2436ca487828-dev.lovable.app"];
export function isCollectorEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint);
    return COLLECTOR_ORIGINS.includes(url.origin) && !url.username && !url.password && !url.search && !url.hash && /^\/api\/(public\/)?v1\/logs\/(ingest|batch)$/.test(url.pathname);
  } catch { return false; }
}
export const COMMUNICATION_TIMEOUT_MS = 5 * 60_000;
export const EVENT_TIMEOUT_MS = 60 * 60_000;
export type CollectorSignal = { last_heartbeat_at: string | null; last_delivery_at: string | null; last_event_at: string | null; last_http_status: number | null };
export function collectorState(c: CollectorSignal, now = Date.now()) {
  if (c.last_http_status && c.last_http_status >= 400) return "error";
  const communication = Math.max(Date.parse(c.last_heartbeat_at ?? "") || 0, Date.parse(c.last_delivery_at ?? "") || 0);
  if (!communication) return "unconfirmed";
  if (now - communication > COMMUNICATION_TIMEOUT_MS) return "delayed";
  if (!c.last_event_at || now - Date.parse(c.last_event_at) > EVENT_TIMEOUT_MS) return "no_events";
  return c.last_heartbeat_at && now - Date.parse(c.last_heartbeat_at) <= COMMUNICATION_TIMEOUT_MS ? "heartbeat" : "logs_only";
}
export const STATUS_LABELS: Record<string, string> = { error: "Erro", unconfirmed: "Sem comunicação confirmada", delayed: "Comunicação atrasada", no_events: "Sem eventos na última hora", heartbeat: "Heartbeat confirmado", logs_only: "Somente envio de logs" };

export function generateConfig(c: { id: string; version: string; sources: Source[] }, os: string) {
  if (c.version !== "5.0.7") throw new Error("Versão não suportada");
  const root = os === "windows" ? "C:/ProgramData/LogSentinel" : "/var/lib/logsentinel";
  const lines = ["[SERVICE]", "    Flush 2", "    Log_Level info", "    Parsers_File multiline.conf", "    HTTP_Server On", "    HTTP_Listen 127.0.0.1", "    HTTP_Port 2020", "    Health_Check On", `    storage.path ${root}/buffer`, "    storage.sync full", "    storage.checksum on", "    storage.backlog.mem_limit 16M", "    scheduler.base 5", "    scheduler.cap 300"];
  for (const s of c.sources) {
    sourceSchema.parse(s);
    lines.push("", "[INPUT]", `    Name ${s.type === "windows_event" ? "winevtlog" : s.type === "journald" ? "systemd" : "tail"}`, `    Tag source.${s.id}`, `    DB ${root}/${s.id}.db`, "    storage.type filesystem");
    if (s.type === "windows_event") lines.push(`    Channels ${s.path}`, "    Read_Existing_Events Off", "    Render_Event_As_XML Off");
    else if (s.type === "journald") lines.push(`    Path ${s.path}`, "    Read_From_Tail On");
    else lines.push(`    Path ${s.path}`, "    Path_Key source_file", "    Read_from_Head On", "    Refresh_Interval 2", "    Rotate_Wait 30", "    DB.Sync Full", "    Buffer_Chunk_Size 16K", "    Buffer_Max_Size 32K", "    Skip_Long_Lines Off", ...(s.type === "java_app" ? ["    multiline.parser logsentinel_java"] : []));
    lines.push("", "[OUTPUT]", "    Name http", `    Match source.${s.id}`, "    Host 127.0.0.1", "    Port 9880", `    URI /${s.id}`, "    Format json", "    Json_date_key collected_at", "    Json_date_format iso8601", "    Retry_Limit False", "    storage.total_limit_size 512M");
  }
  return lines.join("\n") + "\n";
}
export const MULTILINE_CONFIG = `[MULTILINE_PARSER]
    Name logsentinel_java
    Type regex
    Flush_Timeout 2000
    Rule "start_state" "/^\\d{4}-\\d{2}-\\d{2}[ T]\\d{2}:\\d{2}:\\d{2}/" "cont"
    Rule "cont" "/^(\\s+|Caused by:|Suppressed:|[a-zA-Z_$][\\w.$]*(Exception|Error))/" "cont"
`;