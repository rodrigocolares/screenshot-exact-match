// @ts-nocheck -- regex-group heavy parser; behavior is covered by parsers.test.ts
import { describe, expect, it } from "vitest";
import { detectLogType, parseLogs } from "./parsers";

describe("IIS W3C", () => {
  const iis = `#Software: Microsoft Internet Information Services 10.0
#Fields: date time s-ip cs-method cs-uri-stem cs-uri-query s-port cs-username c-ip cs(User-Agent) sc-status sc-substatus sc-win32-status time-taken
2026-11-18 20:00:01 10.0.0.1 GET /api/pedidos - 443 - 203.0.113.5 Mozilla/5.0 500 0 0 1532
2026-11-18 20:00:02 10.0.0.1 GET /home - 443 joao 203.0.113.6 Mozilla/5.0 200 0 0 15`;
  it("detects and parses fields", () => {
    expect(detectLogType(iis.split("\n"))).toBe("iis_access");
    const r = parseLogs(iis);
    expect(r.events).toHaveLength(2);
    expect(r.events[0].http_status).toBe(500);
    expect(r.events[0].severity).toBe("ERROR");
    expect(r.events[0].response_time).toBe(1532);
    expect(r.events[0].username).toBeNull();
    expect(r.events[0].timestamp).toBe("2026-11-18T20:00:01.000Z");
    expect(r.events[1].username).toBe("joao");
  });
  it("rejects lines with wrong field count", () => {
    const r = parseLogs(iis + "\n2026-11-18 20:00:03 broken");
    expect(r.rejected).toHaveLength(1);
  });
});

describe("Apache / Nginx access", () => {
  it("parses combined", () => {
    const l = `203.0.113.66 - - [18/Nov/2026:20:00:00 -0300] "GET /.env HTTP/1.1" 403 199 "-" "curl/8.0"`;
    const r = parseLogs(l);
    expect(r.detected).toBe("apache_access");
    expect(r.events[0].http_status).toBe(403);
    expect(r.events[0].timestamp).toBe("2026-11-18T23:00:00.000Z");
    expect(r.events[0].event_category).toBe("suspicious_request");
  });
  it("parses nginx with request_time and upstream fields", () => {
    const l = `1.2.3.4 - - [18/Nov/2026:20:00:00 +0000] "GET /api HTTP/1.1" 504 0 "-" "ua" rt=60.001 urt="60.000" us=504`;
    const r = parseLogs(l);
    expect(r.detected).toBe("nginx_access");
    expect(r.events[0].response_time).toBeCloseTo(60001);
    expect(r.events[0].attributes.upstream_status).toBe("504");
  });
});

describe("Nginx error", () => {
  it("categorizes upstream timeout", () => {
    const l = `2026/11/18 20:00:00 [error] 123#0: *45 upstream timed out (110: Connection timed out) while reading response header from upstream, client: 1.2.3.4, server: api, request: "GET /pay HTTP/1.1", upstream: "http://10.0.0.5:8080/pay"`;
    const r = parseLogs(l);
    expect(r.events[0].event_category).toBe("upstream_timeout");
    expect(r.events[0].client_ip).toBe("1.2.3.4");
    expect(r.events[0].request_path).toBe("/pay");
  });
});

describe("Java multiline", () => {
  it("groups stack traces into one event", () => {
    const l = `2026-11-18 20:00:00.123 ERROR 1234 --- [main] c.e.PayService : Falha ao processar
java.lang.NullPointerException: cliente is null
\tat c.e.PayService.run(PayService.java:87)
2026-11-18 20:00:01.000  INFO 1234 --- [main] c.e.App : ok`;
    const r = parseLogs(l);
    expect(r.detected).toBe("java_app");
    expect(r.events).toHaveLength(2);
    expect(r.events[0].attributes.exception).toBe("java.lang.NullPointerException");
    expect(r.events[0].severity).toBe("ERROR");
  });
  it("marks OutOfMemoryError as critical", () => {
    const r = parseLogs(`2026-11-18 20:00:00,123 [main] ERROR com.x.Y - java.lang.OutOfMemoryError: Java heap space`);
    expect(r.events[0].severity).toBe("CRITICAL");
  });
});

describe("Linux auth", () => {
  it("extracts SSH failures", () => {
    const l = `Nov 18 20:00:00 web01 sshd[999]: Failed password for invalid user admin from 203.0.113.99 port 52144 ssh2`;
    const r = parseLogs(l, "auto", new Date("2026-11-19T00:00:00Z"));
    expect(r.detected).toBe("linux_auth");
    expect(r.events[0].event_category).toBe("auth_failure");
    expect(r.events[0].username).toBe("admin");
    expect(r.events[0].client_ip).toBe("203.0.113.99");
  });
});

describe("Additional formats and edge cases", () => {
  it("parses IIS FTP failures without HTTP fields", () => {
    const r = parseLogs(`#Software: Microsoft Internet Information Services FTP\n#Fields: date time c-ip cs-username cs-method cs-uri-stem sc-status\n2026-11-18 20:00:00 203.0.113.10 alice PASS - 530`);
    expect(r.detected).toBe("iis_ftp");
    expect(r.events[0].event_category).toBe("auth_failure");
    expect(r.events[0].http_status).toBeNull();
    expect(r.events[0].attributes.ftp_status).toBe(530);
  });
  it("rejects W3C data without its header", () => {
    expect(parseLogs("2026-11-18 20:00:00 GET / 200", "iis_access").rejected[0].line).toBe(1);
  });
  it("parses Apache errors", () => {
    const r = parseLogs('[Wed Nov 18 20:00:00.123456 2026] [core:error] [pid 123] [client 203.0.113.8:5678] AH00126: access denied');
    expect(r.detected).toBe("apache_error");
    expect(r.events[0].client_ip).toBe("203.0.113.8");
    expect(r.events[0].event_category).toBe("access_denied");
  });
  it("keeps absent common-access fields null", () => {
    const r = parseLogs('203.0.113.9 - - [18/Nov/2026:20:00:00 +0000] "GET / HTTP/1.1" 200 10');
    expect(r.events[0].user_agent).toBeNull();
    expect(r.events[0].response_time).toBeNull();
    expect(r.events[0].username).toBeNull();
  });
  it("parses vsftpd IPv4-mapped addresses", () => {
    const r = parseLogs('Wed Nov 18 20:00:00 2026 [pid 1234] [alice] FAIL LOGIN: Client "::ffff:203.0.113.9"');
    expect(r.detected).toBe("vsftpd");
    expect(r.events[0].client_ip).toBe("203.0.113.9");
    expect(r.events[0].severity).toBe("WARN");
  });
  it("parses ISO syslog SSH success", () => {
    const r = parseLogs('2026-11-18T20:00:00-03:00 web01 sshd[99]: Accepted publickey for alice from 203.0.113.4 port 22 ssh2');
    expect(r.events[0].timestamp).toBe("2026-11-18T23:00:00.000Z");
    expect(r.events[0].event_category).toBe("auth_success");
  });
  it("handles syslog year rollover", () => {
    const r = parseLogs("Dec 31 23:59:59 web01 kernel: ok", "syslog", new Date("2027-01-01T01:00:00Z"));
    expect(r.events[0].timestamp).toBe("2026-12-31T23:59:59.000Z");
  });
  it("parses JSON epoch seconds with absent fields null", () => {
    const r = parseLogs('{"timestamp":1795032000,"message":"ok","level":"warning"}');
    expect(r.events[0].timestamp).toBe("2026-11-18T20:00:00.000Z");
    expect(r.events[0].severity).toBe("WARN");
    expect(r.events[0].client_ip).toBeNull();
    expect(r.events[0].service_name).toBeNull();
  });
  it("rejects malformed JSON and missing dates independently", () => {
    const r = parseLogs('{broken}\n{"message":"no time"}\n{"timestamp":"2026-11-18T20:00:00Z","message":"valid"}', "json");
    expect(r.rejected.map((row) => row.line)).toEqual([1, 2]);
    expect(r.events).toHaveLength(1);
    expect(r.total).toBe(3);
  });
  it("handles BOM, CRLF and blanks", () => {
    const r = parseLogs('\uFEFF{"timestamp":"2026-11-18T20:00:00Z","message":"ok"}\r\n\r\n');
    expect(r.detected).toBe("json");
    expect(r.total).toBe(1);
    expect(r.rejected).toEqual([]);
  });
  it("rejects undated generic text", () => {
    const r = parseLogs("no date\n2026-11-18 20:00:00 WARN disk", "generic");
    expect(r.rejected[0].line).toBe(1);
    expect(r.events[0].severity).toBe("WARN");
  });
  it("rejects orphan Java continuation lines", () => {
    const r = parseLogs("at app.Main.run(Main.java:10)\n2026-11-18 20:00:00 INFO app.Main - ok", "java_app");
    expect(r.rejected[0].line).toBe(1);
    expect(r.events).toHaveLength(1);
  });
});
