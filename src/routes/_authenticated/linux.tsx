import { createFileRoute } from "@tanstack/react-router";
import { OsOverview } from "@/components/app/OsOverview";

export const Route = createFileRoute("/_authenticated/linux")({
  head: () => ({ meta: [{ title: "Linux — LogSentinel AI" }, { name: "description", content: "Apache, Nginx, Java, SSH, syslog e FTP." }, { property: "og:title", content: "Linux — LogSentinel AI" }, { property: "og:description", content: "Apache, Nginx, Java, SSH, syslog e FTP." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: () => (
    <OsOverview
      os="linux"
      title="Linux"
      description="Apache, Nginx, aplicações Java, SSH, syslog e FTP em servidores Linux. Últimos 7 dias."
      sources={[
        { key: "apache_access", label: "Apache — Access", desc: "Common/Combined, vhosts, status e caminhos sensíveis.", quick: [{ label: "403", search: { status: "403" } }, { label: "5xx", search: { status: "5xx" } }, { label: "Suspeitas", search: { category: "suspicious_request" } }] },
        { key: "apache_error", label: "Apache — Error", desc: "Erros do servidor, módulos e acessos negados." },
        { key: "nginx_access", label: "Nginx — Access", desc: "request_time, upstream_status, rate limiting.", quick: [{ label: "5xx", search: { status: "5xx" } }, { label: "429", search: { status: "429" } }] },
        { key: "nginx_error", label: "Nginx — Error", desc: "Timeouts de upstream, conexões recusadas, proxy.", quick: [{ label: "Upstream timeout", search: { category: "upstream_timeout" } }] },
        { key: "java_app", label: "Aplicações Java", desc: "Spring Boot, Tomcat, Log4j, Logback — stack traces multilinha.", quick: [{ label: "Exceções", search: { category: "exception" } }, { label: "Críticos", search: { severity: "CRITICAL" } }] },
        { key: "linux_auth", label: "SSH / auth.log", desc: "Falhas de login, sudo e escalonamento de privilégio.", quick: [{ label: "Falhas de login", search: { category: "auth_failure" } }] },
        { key: "vsftpd", label: "FTP Linux (vsftpd)", desc: "Logins, uploads e falhas de transferência.", quick: [{ label: "Falhas", search: { category: "transfer_failure" } }] },
        { key: "syslog", label: "Syslog", desc: "Eventos do sistema, systemd, kernel e OOM." },
      ]}
    />
  ),
});
