"""The changes orkeon-workshop made to cc-usage.py (../README.md).

Each runs the script as the image runs it, in its own process: PROJECTS_DIR is read
once, when the module loads, from the environment of that process.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tests import SOURCE
from tests.collectors import CLAUDE_FIXTURES, cc_usage


SCRIPT = SOURCE / "cc-usage.py"
# The alpha transcript: its first main turn carries 100 + 1000 + 200 tokens of context.
ALPHA = "with-subagent-and-cost-state"
ALPHA_STARTUP = 1300
# Its one subagent: a single turn of 30 tokens of context, `isSidechain: true`.
AGENT = "a1b2c3d4"
AGENT_STARTUP = 30


class WorkshopChangesTests(unittest.TestCase):
    def setUp(self):
        scratch = tempfile.TemporaryDirectory()
        self.addCleanup(scratch.cleanup)
        self.scratch = Path(scratch.name)
        self.home = self.scratch / "home"
        self.config = self.scratch / "config"
        self.home.mkdir()
        self.config.mkdir()
        (self.config / "projects").symlink_to(CLAUDE_FIXTURES / "projects")

    def env(self, config_dir: Path | None):
        env = {k: v for k, v in os.environ.items() if k != "CLAUDE_CONFIG_DIR"}
        env["HOME"] = str(self.home)
        if config_dir is not None:
            env["CLAUDE_CONFIG_DIR"] = str(config_dir)
        return env

    def run_script(self, *arguments: str, config_dir: Path | None = None):
        return subprocess.run([sys.executable, str(SCRIPT), "--no-fetch", *arguments],
                              capture_output=True, text=True, timeout=60,
                              env=self.env(config_dir), cwd=str(self.scratch))

    def loaded(self, expression: str, config_dir: Path | None) -> str:
        code = ("import importlib.util, sys; sys.path.insert(0, sys.argv[1]); "
                "spec = importlib.util.spec_from_file_location('cc_usage', sys.argv[2]); "
                "m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); "
                f"print({expression})")
        done = subprocess.run([sys.executable, "-c", code, str(SOURCE), str(SCRIPT)],
                              capture_output=True, text=True, timeout=60,
                              env=self.env(config_dir), check=True)
        return done.stdout.strip()

    def test_the_transcripts_are_looked_up_under_claude_config_dir_when_it_is_set(self):
        self.assertEqual(self.loaded("m.PROJECTS_DIR", self.config),
                         str(self.config / "projects"))

    def test_without_claude_config_dir_they_stay_under_the_home_folder(self):
        self.assertEqual(self.loaded("m.PROJECTS_DIR", None),
                         str(self.home / ".claude" / "projects"))

    def test_the_users_claude_md_is_read_from_the_same_folder(self):
        (self.config / "CLAUDE.md").write_text("# user instructions\n", encoding="utf-8")

        chain = self.loaded("[f['path'] for f in m.instruction_chain('')]", self.config)

        self.assertIn(str(self.config / "CLAUDE.md"), chain)

    def test_a_session_found_by_its_id_prints_as_json_with_its_startup_tokens(self):
        done = self.run_script("--session", ALPHA[:13], "--json", config_dir=self.config)

        self.assertEqual(done.returncode, 0, done.stderr)
        payload = json.loads(done.stdout)
        self.assertEqual(payload["id"], ALPHA)
        startup = [s for s in payload["sources"] if s["tool"] == "(startup)"]
        self.assertEqual([s["added"] for s in startup], [ALPHA_STARTUP])
        self.assertEqual(payload["turns"], 3)
        self.assertIn("grade", payload)

    def test_a_session_given_by_its_path_prints_the_same_payload(self):
        path = CLAUDE_FIXTURES / "projects" / "-workspace-alpha" / f"{ALPHA}.jsonl"

        done = self.run_script("--session", str(path), "--json", config_dir=self.config)

        self.assertEqual(done.returncode, 0, done.stderr)
        self.assertEqual(json.loads(done.stdout)["id"], ALPHA)

    def test_an_unknown_session_prints_no_json_and_fails(self):
        done = self.run_script("--session", "no-such-session", "--json",
                               config_dir=self.config)

        self.assertEqual(done.returncode, 1)
        self.assertEqual(done.stdout, "")
        self.assertIn("No transcript", done.stderr)

    def test_a_subagent_found_by_its_id_is_measured_as_its_own_chain(self):
        done = self.run_script("--agent", AGENT[:4], "--json", config_dir=self.config)

        self.assertEqual(done.returncode, 0, done.stderr)
        payload = json.loads(done.stdout)
        self.assertEqual(payload["id"], "agent-" + AGENT)
        self.assertEqual(payload["turns"], 1)
        startup = [s for s in payload["sources"] if s["tool"] == "(startup)"]
        self.assertEqual([s["added"] for s in startup], [AGENT_STARTUP])

    def test_a_subagent_given_by_its_path_prints_the_agent_report(self):
        path = (CLAUDE_FIXTURES / "projects" / "-workspace-alpha" / ALPHA / "subagents"
                / f"agent-{AGENT}.jsonl")

        done = self.run_script("--agent", str(path), config_dir=self.config)

        self.assertEqual(done.returncode, 0, done.stderr)
        self.assertIn(f"Agent agent-{AGENT}", done.stdout)
        self.assertIn("1 main turns", done.stdout)
        self.assertIn("Final context 30 tokens", done.stdout)

    def test_an_unknown_agent_prints_no_json_and_fails(self):
        done = self.run_script("--agent", "no-such-agent", "--json", config_dir=self.config)

        self.assertEqual(done.returncode, 1)
        self.assertEqual(done.stdout, "")
        self.assertIn("No subagent transcript", done.stderr)

    def test_the_session_still_counts_that_subagent_as_a_sidechain(self):
        done = self.run_script("--session", ALPHA[:13], "--json", config_dir=self.config)

        payload = json.loads(done.stdout)
        self.assertEqual(payload["turns"], 3)
        self.assertEqual([a["label"] for a in payload.get("agents", [])], ["map the repo"])

    def test_without_json_the_session_report_stays_the_upstream_text(self):
        done = self.run_script("--session", ALPHA[:13], config_dir=self.config)

        self.assertEqual(done.returncode, 0, done.stderr)
        self.assertIn("What filled the context", done.stdout)
        self.assertIn("(startup)", done.stdout)


PRICES = json.loads((CLAUDE_FIXTURES / "litellm-prices.json").read_text())
SONNET_OUTPUT_RATE = 2e-05


def record(mid: str, output: int, block: dict, stamp: str, sidechain: bool = False) -> str:
    """One transcript line: a response is written as one such record per content block."""
    entry = {"type": "assistant", "sessionId": "session-final", "cwd": "/workspace/final",
             "timestamp": stamp, "message": {
                 "id": mid, "model": "claude-sonnet-5", "content": [block],
                 "usage": {"input_tokens": 10, "output_tokens": output,
                           "cache_read_input_tokens": 500, "cache_creation_input_tokens": 0}}}
    if sidechain:
        entry["isSidechain"] = True
    return json.dumps(entry)


THINKING = {"type": "thinking", "thinking": "Let me look."}
TEXT = {"type": "text", "text": "Done."}


class FinalOutputTokensTests(unittest.TestCase):
    """A response is several records of one `message.id`; the last holds the final count.

    The first record's `output_tokens` is partial (4 here, written at the end of the thinking
    block), the last one's is the count the API billed (812).
    """

    def setUp(self):
        scratch = tempfile.TemporaryDirectory()
        self.addCleanup(scratch.cleanup)
        self.scratch = Path(scratch.name)
        self.home = self.scratch / "home"
        self.config = self.scratch / "config"
        project = self.config / "projects" / "-workspace-final"
        self.home.mkdir()
        project.mkdir(parents=True)
        # A main session: one response, 4 then 812, and a second one of 7 in one record.
        self.session = project / "session-final.jsonl"
        self.session.write_text("\n".join([
            record("msg-main", 4, THINKING, "2026-10-13T10:00:00Z"),
            record("msg-main", 812, TEXT, "2026-10-13T10:00:03Z"),
            record("msg-small", 7, TEXT, "2026-10-13T10:01:00Z"),
        ]) + "\n", encoding="utf-8")
        # Its one subagent: one response, 4 then 812 as well.
        subagents = project / "session-final" / "subagents"
        subagents.mkdir(parents=True)
        self.agent = subagents / "agent-feed0001.jsonl"
        self.agent.write_text("\n".join([
            record("msg-sub", 4, THINKING, "2026-10-13T10:00:10Z", sidechain=True),
            record("msg-sub", 812, TEXT, "2026-10-13T10:00:12Z", sidechain=True),
        ]) + "\n", encoding="utf-8")

    def env(self):
        env = {k: v for k, v in os.environ.items() if k != "CLAUDE_CONFIG_DIR"}
        env.update(HOME=str(self.home), CLAUDE_CONFIG_DIR=str(self.config))
        return env

    def payload(self, *arguments: str) -> dict:
        done = subprocess.run([sys.executable, str(SCRIPT), "--no-fetch", *arguments, "--json"],
                              capture_output=True, text=True, timeout=60, env=self.env(),
                              cwd=str(self.scratch))
        self.assertEqual(done.returncode, 0, done.stderr)
        return json.loads(done.stdout)

    def test_a_response_of_a_main_session_counts_its_last_records_output(self):
        turns, *_ = cc_usage.read_session(self.session, with_subagents=False)

        by_id = {t.mid: t for t in turns}
        self.assertEqual(by_id["msg-main"].output, 812)
        self.assertEqual(by_id["msg-main"].usage["output_tokens"], 812)
        self.assertEqual(by_id["msg-small"].output, 7)

    def test_the_other_fields_stay_those_of_the_first_record_and_the_cost_follows(self):
        turns, *_ = cc_usage.read_session(self.session, with_subagents=False)
        usage = {t.mid: t for t in turns}["msg-main"].usage
        rates = cc_usage.build_rate_table(PRICES)["claude-sonnet-5"]

        self.assertEqual(usage["input_tokens"], 10)
        self.assertEqual(usage["cache_read_input_tokens"], 500)
        self.assertAlmostEqual(cc_usage.output_cost(usage, rates), 812 * SONNET_OUTPUT_RATE)

    def test_the_session_report_counts_812_output_tokens_for_the_main_response(self):
        sources = {s["tool"]: s for s in self.payload("--session", str(self.session))["sources"]}

        self.assertEqual(sources["(response generation)"]["added"], 812 + 7)

    def test_a_response_of_a_subagent_read_on_its_own_counts_812(self):
        sources = {s["tool"]: s for s in self.payload("--agent", str(self.agent))["sources"]}

        self.assertEqual(sources["(response generation)"]["added"], 812)

    def test_a_response_of_a_subagent_counts_812_in_the_session_subagents_line(self):
        payload = self.payload("--session", str(self.session))

        self.assertEqual([a["output"] for a in payload["agents"]], [812])
        sources = {s["tool"]: s for s in payload["sources"]}
        self.assertEqual(sources["(subagents)"]["added"], 812)

    def test_the_aggregate_views_count_each_response_once_with_its_final_output(self):
        code = ("import importlib.util, json, sys; sys.path.insert(0, sys.argv[1]); "
                "spec = importlib.util.spec_from_file_location('cc_usage', sys.argv[2]); "
                "m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); "
                "print(json.dumps(sorted(x['usage']['output_tokens'] "
                "for x in m.iter_messages(None))))")
        done = subprocess.run([sys.executable, "-c", code, str(SOURCE), str(SCRIPT)],
                              capture_output=True, text=True, timeout=60, env=self.env(),
                              check=True)

        self.assertEqual(json.loads(done.stdout), [7, 812, 812])

    def test_a_later_record_with_a_smaller_count_does_not_lower_it(self):
        self.agent.write_text("\n".join([
            record("msg-sub", 812, THINKING, "2026-10-13T10:00:10Z", sidechain=True),
            record("msg-sub", 4, TEXT, "2026-10-13T10:00:12Z", sidechain=True),
        ]) + "\n", encoding="utf-8")

        turns = cc_usage.read_agent_turns(self.agent, "agent")

        self.assertEqual([t.output for t in turns], [812])


if __name__ == "__main__":
    unittest.main()
