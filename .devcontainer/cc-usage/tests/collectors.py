"""cc-usage.py, loaded by path.

It carries a hyphen so that it reads as a command: no ``import`` statement can name
it. Adapted from claude-code-token-usage: the Codex collector and the dashboard
gateway are not part of this copy.
"""
from __future__ import annotations

import importlib.util
import sys

from tests import SOURCE


CLAUDE_FIXTURES = SOURCE / "tests" / "fixtures" / "claude"


def _load(name: str, filename: str):
    spec = importlib.util.spec_from_file_location(name, SOURCE / filename)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


cc_usage = _load("cc_usage", "cc-usage.py")
