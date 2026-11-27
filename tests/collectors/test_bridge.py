import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("bridge", Path(__file__).parents[2] / "public/collectors/bridge.py")
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)


class BridgeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.source = {"id": "source", "type": "generic", "path": "/tmp/test.log"}
        self.config = {"collector_id": "collector", "hostname": "host", "operating_system": "linux", "sources": [self.source], "endpoint": "https://example.test/api/v1/logs/ingest"}
        self.adapter = bridge.Bridge(self.config, self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_split_limits(self):
        batches = bridge.split_batches(self.config, self.source, [{"message": "á" * 4000}] * 1200)
        self.assertEqual(sum(len(b["events"]) for b in batches), 1200)
        self.assertTrue(all(len(bridge.encode(b)) <= 1048576 and len(b["events"]) <= 1000 for b in batches))

    def test_credentials_are_never_forwarded_by_redirect(self):
        self.assertIsNone(bridge.NoRedirect().redirect_request(None, None, 302, "redirect", {}, "https://other.test"))

    def test_network_failure_and_restart_preserve_batch(self):
        self.adapter.enqueue("source", [{"log": "real file input", "collected_at": "2026-11-22T03:00:00Z"}])
        self.adapter.send = lambda body: (503, {}, 5)
        self.adapter.forward_once()
        other = bridge.Bridge(self.config, self.tmp.name)
        sent = []
        other.send = lambda body: (sent.append(json.loads(body)) or 202, {"accepted": 1, "rejected": 0}, 0)
        other.forward_once()
        self.assertEqual(len(sent), 1)
        self.assertEqual(other.forward_once(), None)

    def test_partial_rejections_quarantined(self):
        self.adapter.enqueue("source", [{"log": "bad"}])
        self.adapter.send = lambda body: (202, {"accepted": 0, "rejected": 1}, 0)
        self.adapter.forward_once()
        with self.adapter.db() as db:
            self.assertEqual(db.execute("SELECT state FROM queue").fetchone()[0], "blocked")

    def test_w3c_real_header_after_restart(self):
        file = Path(self.tmp.name) / "iis.log"
        file.write_text("#Fields: date time c-ip sc-status\n2026-11-22 03:00:00 1.2.3.4 401\n")
        event = bridge.event_from_record({"log": "2026-11-22 03:00:00 1.2.3.4 401", "source_file": str(file)}, {"type": "iis_access"})
        self.assertEqual(event["raw"].splitlines()[0], "#Fields: date time c-ip sc-status")

    def test_windows_event_fields_and_record_identity(self):
        event = bridge.event_from_record({"Message": "Logon denied", "EventID": 4625, "Level": 3, "Computer": "WIN", "Channel": "Security", "EventRecordID": 42}, {"type": "windows_event", "path": "Security"})
        self.assertEqual(event["attributes"]["EventID"], 4625)
        self.assertEqual(event["severity"], "WARN")
        self.assertEqual(event["external_id"], "WIN|Security|42")


if __name__ == "__main__":
    unittest.main()