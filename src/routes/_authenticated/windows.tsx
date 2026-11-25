import { createFileRoute } from "@tanstack/react-router";
import { OsOverview } from "@/components/app/OsOverview";

export const Route = createFileRoute("/_authenticated/windows")({
  head: () => ({ meta: [{ title: "Windows — LogSentinel AI" }, { name: "description", content: "IIS, FTP e Windows Event Log." }, { property: "og:title", content: "Windows — LogSentinel AI" }, { property: "og:description", content: "IIS, FTP e Windows Event Log." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: () => (
    <OsOverview
      os="windows"
      title="Windows"
      description="IIS, IIS FTP, Windows Event Logs e aplicações em servidores Windows. Últimos 7 dias."
      sources={[
        { key: "iis_access", label: "IIS — Internet Information Services", desc: "Requisições HTTP/HTTPS, status, substatus, Win32, time-taken (W3C Extended).", quick: [{ label: "5xx", search: { status: "5xx" } }, { label: "404", search: { status: "404" } }, { label: "401/403", search: { status: "4xx" } }, { label: "Suspeitas", search: { category: "suspicious_request" } }] },
        { key: "iis_ftp", label: "IIS FTP", desc: "Login, uploads, downloads e falhas de autenticação FTP.", quick: [{ label: "Falhas de login", search: { category: "auth_failure" } }] },
        { key: "windows_event", label: "Windows Event Logs", desc: "Application, System, Security — Event ID, Provider, Channel.", quick: [{ label: "Falhas de logon (4625)", search: { category: "auth_failure" } }, { label: "Falhas de serviço", search: { category: "service_failure" } }] },
        { key: "java_app", label: "Aplicações Java / .NET", desc: "Exceções e stack traces de aplicações.", quick: [{ label: "Exceções", search: { category: "exception" } }] },
        { key: "json", label: "Logs personalizados (JSON)", desc: "Logs estruturados enviados por aplicações." },
      ]}
    />
  ),
});
