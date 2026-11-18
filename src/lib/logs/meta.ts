export const SEVERITIES = ["DEBUG", "INFO", "WARN", "ERROR", "CRITICAL"] as const;

export const SEVERITY_LABEL: Record<string, string> = {
  DEBUG: "Debug",
  INFO: "Info",
  WARN: "Alerta",
  ERROR: "Erro",
  CRITICAL: "Crítico",
};

export const SEVERITY_CLASS: Record<string, string> = {
  DEBUG: "text-sev-debug bg-sev-debug/10 border-sev-debug/30",
  INFO: "text-sev-info bg-sev-info/10 border-sev-info/30",
  WARN: "text-sev-warn bg-sev-warn/10 border-sev-warn/30",
  ERROR: "text-sev-error bg-sev-error/10 border-sev-error/30",
  CRITICAL: "text-sev-critical bg-sev-critical/15 border-sev-critical/40",
};

export const SEVERITY_VAR: Record<string, string> = {
  DEBUG: "var(--sev-debug)",
  INFO: "var(--sev-info)",
  WARN: "var(--sev-warn)",
  ERROR: "var(--sev-error)",
  CRITICAL: "var(--sev-critical)",
};

export const SOURCE_LABEL: Record<string, string> = {
  iis_access: "IIS",
  iis_ftp: "IIS FTP",
  windows_event: "Windows Event Log",
  apache_access: "Apache Access",
  apache_error: "Apache Error",
  nginx_access: "Nginx Access",
  nginx_error: "Nginx Error",
  java_app: "Java",
  linux_auth: "Linux Auth / SSH",
  syslog: "Syslog",
  vsftpd: "FTP Linux (vsftpd)",
  json: "JSON",
  generic: "Genérico",
};

export const TIME_RANGES = [
  { value: "15m", label: "Últimos 15 min", ms: 15 * 60e3, bucket: "minute" },
  { value: "1h", label: "Última hora", ms: 3600e3, bucket: "minute" },
  { value: "6h", label: "Últimas 6 horas", ms: 6 * 3600e3, bucket: "hour" },
  { value: "12h", label: "Últimas 12 horas", ms: 12 * 3600e3, bucket: "hour" },
  { value: "24h", label: "Últimas 24 horas", ms: 24 * 3600e3, bucket: "hour" },
  { value: "7d", label: "Últimos 7 dias", ms: 7 * 86400e3, bucket: "day" },
  { value: "30d", label: "Últimos 30 dias", ms: 30 * 86400e3, bucket: "day" },
] as const;

export type RangeValue = (typeof TIME_RANGES)[number]["value"];

export const rangeOf = (v: string) => TIME_RANGES.find((r) => r.value === v) ?? TIME_RANGES[4];

export const fmtDate = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" }) : "—";

export const fmtNum = (n: number | null | undefined) => (n ?? 0).toLocaleString("pt-BR");
