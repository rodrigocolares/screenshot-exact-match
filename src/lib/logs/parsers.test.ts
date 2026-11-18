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
