import os
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("agent-metrics.py")


def write_log(path, records):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(records) + "\n", encoding="utf-8")


def set_mtime(path, value):
    os.utime(path, ns=(value, value))


def meta(thread_id, started, cwd, parent=None, role=None):
    payload = {"id": thread_id, "cwd": cwd}
    if started is not None:
        payload["timestamp"] = started
    if parent is not None:
        payload["parent_thread_id"] = parent
    if role is not None:
        payload["agent_role"] = role
    return {"type": "session_meta", "timestamp": started, "payload": payload}


def usage(total, timestamp):
    return {
        "type": "token_usage_record",
        "timestamp": timestamp,
        "payload": {"thread_token_usage": {"total_tokens": total}},
    }


class AgentMetricsTest(unittest.TestCase):
    def test_recursive_dedup_latest_usage_cutoffs_and_missing_fields(self):
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            logs = base / "logs"
            workspace = base / "workspace"
            workspace.mkdir()
            stamp = "2026-10-03T12:00:00Z"

            root_original = logs / "rollout-before.jsonl"
            write_log(root_original, [
                json.dumps(meta("root-before", "2026-10-03T11:59:00Z", str(workspace))),
                json.dumps(usage(10, "2026-10-03T11:59:01Z")),
                json.dumps(usage(14, "2026-10-03T11:59:02Z")),
                json.dumps({"type": "message", "timestamp": "2026-10-03T11:59:03Z", "text": "SECRET_TRANSCRIPT"}),
            ])
            token_copy = logs / "root-copies" / "rollout-token-copy.jsonl"
            write_log(token_copy, [
                json.dumps(meta("root-before", "2026-10-03T11:59:00Z", str(workspace))),
                json.dumps(usage(20, "2026-10-03T11:59:04Z")),
                json.dumps({"type": "message", "timestamp": "2026-10-03T11:59:06Z"}),
            ])
            newer_lower_copy = logs / "root-copies" / "rollout-lower-copy.jsonl"
            write_log(newer_lower_copy, [
                json.dumps(meta("root-before", "2026-10-03T11:59:00Z", str(workspace))),
                json.dumps(usage(16, "2026-10-03T11:59:03Z")),
                json.dumps({"type": "message", "timestamp": "2026-10-03T11:59:07Z"}),
            ])
            tied_copy = logs / "root-copies" / "rollout-tied-copy.jsonl"
            write_log(tied_copy, [
                json.dumps(meta("root-before", "2026-10-03T11:59:00Z", str(workspace))),
                json.dumps(usage(22, "2026-10-03T11:59:03Z")),
                json.dumps({"type": "message", "timestamp": "2026-10-03T11:59:08Z"}),
            ])
            newest_missing_copy = logs / "root-copies" / "rollout-no-token-copy.jsonl"
            write_log(newest_missing_copy, [
                json.dumps(meta("root-before", "2026-10-03T11:59:00Z", str(workspace))),
                json.dumps({"type": "message", "timestamp": "2026-10-03T11:59:10Z"}),
            ])
            set_mtime(root_original, 1_700_000_000_000_000_000)
            set_mtime(token_copy, 1_700_000_001_000_000_000)
            set_mtime(newer_lower_copy, 1_700_000_002_000_000_000)
            set_mtime(tied_copy, 1_700_000_002_500_000_000)
            set_mtime(newest_missing_copy, 1_700_000_003_000_000_000)
            child_records = [
                json.dumps(meta("child-coder", "2026-10-03T11:59:04Z", str(workspace), "root-before", "Coder")),
                json.dumps(usage(7, "2026-10-03T11:59:05Z")),
                json.dumps({"type": "task_complete", "timestamp": "2026-10-03T11:59:06Z", "payload": {"turn_id": "turn-coder", "duration_ms": 500}}),
            ]
            child_copy_records = list(child_records)
            duplicate_completion = json.loads(child_copy_records[-1])
            duplicate_completion["timestamp"] = "2026-10-03T11:59:06.500Z"
            child_copy_records[-1] = json.dumps(duplicate_completion)
            child_path = logs / "one" / "rollout-child.jsonl"
            child_copy_path = logs / "archived" / "rollout-child-copy.jsonl"
            write_log(child_path, child_records)
            write_log(child_copy_path, child_copy_records)
            set_mtime(child_path, 1_700_000_000_000_000_000)
            set_mtime(child_copy_path, 1_700_000_003_000_000_000)
            write_log(logs / "rollout-grandchild.jsonl", [
                json.dumps(meta("child-tester", "2026-10-03T11:59:07Z", str(workspace), "child-coder", "Tester")),
                json.dumps(usage(3, "2026-10-03T11:59:08Z")),
                json.dumps({"type": "event_msg", "timestamp": "2026-10-03T11:59:09Z", "payload": {"type": "task_complete", "duration_ms": 800}}),
            ])
            write_log(logs / "rollout-boundary.jsonl", [
                json.dumps(meta("root-boundary", stamp, str(workspace))),
                json.dumps(usage(99, "2026-10-03T12:00:01Z")),
            ])
            write_log(logs / "rollout-nested.jsonl", [
                json.dumps(meta("root-nested", "2026-10-03T11:58:00Z", str(workspace / "frontend"))),
                json.dumps(usage(5, "2026-10-03T11:58:01Z")),
            ])
            write_log(logs / "rollout-after.jsonl", [
                json.dumps(meta("root-after", "2026-10-03T12:01:00Z", str(workspace))),
                "{broken json",
            ])
            write_log(logs / "rollout-unknown.jsonl", [
                json.dumps(meta("child-unknown", None, str(workspace), "root-after")),
            ])
            write_log(logs / "rollout-conflict-a.jsonl", [
                json.dumps(meta("child-conflict", None, str(workspace), "root-after", "Coder")),
            ])
            write_log(logs / "rollout-conflict-b.jsonl", [
                json.dumps(meta("child-conflict", None, str(workspace), "root-after", "Tester")),
            ])

            common = [sys.executable, str(SCRIPT), "--workspace", str(workspace), "--logs-dir", str(logs)]
            before = subprocess.run(common + ["--before", stamp], text=True, capture_output=True, check=True).stdout
            self.assertIn("Matching root sessions: 1", before)
            self.assertIn("Session root-before", before)
            self.assertNotIn("Session root-nested", before)
            self.assertNotIn("root-boundary", before)
            self.assertIn("observed wall span: 10.000s (10000 ms)", before)
            self.assertIn("total tokens (root + linked descendants): 30", before)
            self.assertIn("linked child sessions: 2", before)
            self.assertIn("Coder: linked spawn count 1; summed task duration 0.500s", before)
            self.assertIn("Tester: linked spawn count 1; summed task duration 0.800s", before)
            self.assertIn("duplicate task_complete observations merged: 1", before)
            self.assertIn("token anomaly: cumulative total decreased across 1 chronological snapshot transition", before)
            self.assertIn("token anomaly: 1 timestamp tie(s) had conflicting totals; greater cumulative total selected", before)
            self.assertIn("Thread copies deduplicated: 6", before)
            self.assertNotIn("SECRET_TRANSCRIPT", before)

            after = subprocess.run(common + ["--after", stamp], text=True, capture_output=True, check=True).stdout
            self.assertIn("Matching root sessions: 1", after, after)
            self.assertIn("Session root-after", after)
            self.assertIn("root + linked descendants): NOT AVAILABLE", after)
            self.assertIn("NOT AVAILABLE: linked spawn count", after)
            self.assertIn("child-unknown: NOT AVAILABLE", after)
            self.assertIn("conflicting metadata fields: agent_role", after)
            self.assertIn("malformed JSON lines: 1", after)
            self.assertNotIn("SECRET_TRANSCRIPT", after)


if __name__ == "__main__":
    unittest.main()
