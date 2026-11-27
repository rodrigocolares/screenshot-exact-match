#!/usr/bin/env python3
"""LogSentinel Fluent Bit local adapter. Python 3.10+, standard library only.
Credentials come ONLY from LOGSENTINEL_API_KEY. Never logged or persisted.
The local 202 acknowledges SQLite durability, NOT backend delivery.
"""
import argparse
import datetime
import hashlib
import json
import os
import sqlite3
import threading
import time
import urllib.error
import urllib.request
import uuid
from urllib.parse import urlparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

MAX_BYTES = 1024 * 1024
MAX_EVENTS = 1000
MAX_SPOOL = 512 * 1024 * 1024


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def encode(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def event_from_record(record, source):
    raw = record.get("log", record.get("message", ""))
    if source["type"] == "windows_event":
        message = record.get("Message", record.get("StringInserts"))
        if isinstance(message, list):
            message = " | ".join(str(s) for s in message)
        if not message:
            raise ValueError("Windows Event without rendered message")
        event = {"message": str(message), "attributes": {k: record[k] for k in ("EventID", "ProviderName", "Level", "TimeCreated", "Computer", "EventRecordID", "Channel") if k in record}}
        level = str(record.get("Level", ""))
        event["severity"] = {"1": "CRITICAL", "2": "ERROR", "3": "WARN", "4": "INFO", "5": "DEBUG"}.get(level, level or "INFO")
        timestamp = record.get("TimeCreated")
        if isinstance(timestamp, str):
            try:
                event["timestamp"] = datetime.datetime.fromisoformat(timestamp.replace("Z", "+00:00")).isoformat()
            except ValueError:
                pass
        if record.get("EventRecordID") is not None:
            event["external_id"] = f'{record.get("Computer", "")}|{record.get("Channel", source["path"])}|{record["EventRecordID"]}'
        return event
    if source["type"] == "journald":
        return {"message": str(record.get("MESSAGE", "")), "timestamp": datetime.datetime.fromtimestamp(int(record.get("__REALTIME_TIMESTAMP", record.get("_SOURCE_REALTIME_TIMESTAMP", time.time() * 1e6))) / 1e6, datetime.timezone.utc).isoformat(), "attributes": {k: record[k] for k in ("_SYSTEMD_UNIT", "_PID", "_COMM", "PRIORITY", "__CURSOR") if k in record}, **({"external_id": str(record["__CURSOR"])} if "__CURSOR" in record else {})}
    if not isinstance(raw, str) or not raw.strip():
        raise ValueError("empty record")
    if source["type"] in ("iis_access", "iis_ftp"):
        if raw.startswith("#"):
            return None
        filename = record.get("source_file")
        if not filename:
            raise ValueError("W3C source_file missing")
        # Read real headers after restart/rotation, never guess field ordering.
        header = None
        with open(filename, encoding="utf-8-sig") as file:
            for line in file:
                if line.startswith("#Fields:"):
                    header = line.rstrip()
                elif not line.startswith("#") and line.strip():
                    break
        if not header:
            raise ValueError("W3C #Fields missing")
        raw = header + "\n" + raw
    if len(raw.encode("utf-8")) > 32000:
        raise ValueError("record exceeds 32000 bytes")
    if source["type"] == "generic":
        return {"message": raw[:8000], "raw": raw, "timestamp": record.get("collected_at", datetime.datetime.now(datetime.timezone.utc).isoformat()), "external_id": hashlib.sha256(encode(record)).hexdigest(), "attributes": {"timestamp_origin": "collector", "source_file": record.get("source_file")}}
    return {"raw": raw, "attributes": {"source_file": record.get("source_file")}}


def split_batches(config, source, events):
    envelope = {"collector_id": config["collector_id"], "source_id": source["id"], "hostname": config["hostname"], "operating_system": config["operating_system"], "source_type": source["type"]}
    batches = []
    current = []
    for event in events:
        candidate = {**envelope, "batch_id": str(uuid.uuid4()), "events": current + [event]}
        if len(candidate["events"]) > MAX_EVENTS or len(encode(candidate)) > MAX_BYTES:
            if not current:
                raise ValueError("single event exceeds payload limit")
            batches.append({**envelope, "batch_id": str(uuid.uuid4()), "events": current})
            current = [event]
        else:
            current.append(event)
    if current:
        final = {**envelope, "batch_id": str(uuid.uuid4()), "events": current}
        if len(encode(final)) > MAX_BYTES:
            raise ValueError("single event exceeds payload limit")
        batches.append(final)
    return batches


class Bridge:
    def __init__(self, config, state_dir):
        self.config = config
        self.sources = {s["id"]: s for s in config["sources"]}
        self.state_dir = Path(state_dir)
        self.state_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.db_path = self.state_dir / "spool.sqlite"
        with self.db() as db:
            db.execute("CREATE TABLE IF NOT EXISTS queue(id INTEGER PRIMARY KEY, body BLOB NOT NULL, state TEXT NOT NULL DEFAULT 'pending', status INTEGER)")
        if os.name != "nt":
            self.db_path.chmod(0o600)
        self.lock = threading.Lock()
        self.last_heartbeat = 0

    def db(self):
        db = sqlite3.connect(self.db_path, timeout=30)
        db.execute("PRAGMA journal_mode=WAL")
        db.execute("PRAGMA synchronous=FULL")
        return db

    def enqueue(self, source_id, records):
        source = self.sources.get(source_id)
        if not source or not isinstance(records, list):
            raise ValueError("unknown source or invalid array")
        events = [e for r in records if (e := event_from_record(r, source)) is not None]
        bodies = [encode(b) for b in split_batches(self.config, source, events)]
        with self.lock, self.db() as db:
            size = db.execute("SELECT coalesce(sum(length(body)),0) FROM queue").fetchone()[0]
            if size + sum(map(len, bodies)) > MAX_SPOOL:
                raise OSError("spool full")
            db.executemany("INSERT INTO queue(body) VALUES(?)", [(b,) for b in bodies])

    def send(self, body):
        key = os.environ.get("LOGSENTINEL_API_KEY", "")
        if not key:
            return 401, {}, 60
        req = urllib.request.Request(self.config["endpoint"], data=body, headers={"Content-Type": "application/json", "Authorization": "Bearer " + key})
        try:
            with urllib.request.build_opener(NoRedirect).open(req, timeout=30) as response:
                return response.status, json.load(response), 0
        except urllib.error.HTTPError as error:
            return error.code, {}, max(60, int(error.headers.get("Retry-After", "60")))
        except (OSError, ValueError):
            return 503, {}, 5

    def forward_once(self):
        with self.db() as db:
            row = db.execute("SELECT id,body FROM queue WHERE state='pending' ORDER BY id LIMIT 1").fetchone()
        if not row:
            return None
        status, result, wait = self.send(row[1])
        with self.db() as db:
            if status == 202 and result.get("rejected", 0) == 0 and "accepted" in result:
                db.execute("DELETE FROM queue WHERE id=?", (row[0],))
            elif status in (400, 403, 413, 422) or (status == 202 and result.get("rejected", 0)):
                db.execute("UPDATE queue SET state='blocked',status=? WHERE id=?", (status, row[0]))
            else:
                db.execute("UPDATE queue SET status=? WHERE id=?", (status, row[0]))
        print(f"backend HTTP {status}; queue record {row[0]}", flush=True)
        return status, wait

    def heartbeat(self):
        # Probe the REAL Fluent Bit health endpoint; bridge uptime alone is insufficient.
        try:
            with urllib.request.urlopen("http://127.0.0.1:2020/api/v1/health", timeout=2) as response:
                if response.status != 200:
                    return
            with urllib.request.urlopen("http://127.0.0.1:2020/api/v1/", timeout=2) as response:
                info = json.load(response)
            version = info.get("fluent-bit", {}).get("version")
            if not version:
                return
        except (OSError, ValueError):
            return
        self.send(encode({"heartbeat": True, "collector_id": self.config["collector_id"], "hostname": self.config["hostname"], "operating_system": self.config["operating_system"], "version": version}))

    def run_worker(self):
        backoff = 5
        while True:
            if time.monotonic() - self.last_heartbeat > 60:
                self.heartbeat()
                self.last_heartbeat = time.monotonic()
            outcome = self.forward_once()
            if outcome and (outcome[0] == 429 or outcome[0] == 401 or outcome[0] >= 500):
                time.sleep(max(backoff, outcome[1]))
                backoff = min(300, backoff * 2)
            else:
                backoff = 5
                time.sleep(1)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    parser.add_argument("--state", required=True)
    args = parser.parse_args()
    config = json.loads(Path(args.config).read_text(encoding="utf-8"))
    endpoint = urlparse(config["endpoint"])
    if endpoint.scheme != "https" or not endpoint.hostname or endpoint.username or endpoint.password or endpoint.query or endpoint.fragment:
        parser.error("HTTPS endpoint required")
    bridge = Bridge(config, args.state)

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 8 * MAX_BYTES:
                self.send_error(413)
                return
            try:
                bridge.enqueue(self.path.strip("/"), json.loads(self.rfile.read(length)))
                self.send_response(202)
                self.end_headers()
                self.wfile.write(b'{"queued":true}')
            except (ValueError, KeyError, TypeError):
                self.send_error(400, "Invalid records; inspect source configuration")
            except OSError:
                self.send_error(503, "Spool or source unavailable")

        def log_message(self, *args):
            pass

    threading.Thread(target=bridge.run_worker, daemon=True).start()
    print("LogSentinel adapter listening on loopback:9880", flush=True)
    ThreadingHTTPServer(("127.0.0.1", 9880), Handler).serve_forever()


if __name__ == "__main__":
    main()