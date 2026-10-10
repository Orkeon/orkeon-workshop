"""The two changes orkeon-workshop made to cc-usage.py (../README.md).

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
from tests.collectors import CLAUDE_FIXTURES


SCRIPT = SOURCE / "cc-usage.py"
# The alpha transcript: its first main turn carries 100 + 1000 + 200 tokens of context.
ALPHA = "with-subagent-and-cost-state"
ALPHA_STARTUP = 1300


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

    def test_without_json_the_session_report_stays_the_upstream_text(self):
        done = self.run_script("--session", ALPHA[:13], config_dir=self.config)

        self.assertEqual(done.returncode, 0, done.stderr)
        self.assertIn("What filled the context", done.stdout)
        self.assertIn("(startup)", done.stdout)


if __name__ == "__main__":
    unittest.main()
