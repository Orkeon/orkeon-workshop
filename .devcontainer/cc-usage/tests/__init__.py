"""Unit tests, run from the folder that holds cc-usage.py: python3 -m unittest discover -s tests -t .

Adapted from claude-code-token-usage (MIT, see ../README.md): the modules live one level up
here, not in ``src/``. This package puts that directory on the import path so a test can name
``session_grade`` the way cc-usage.py does.
"""
from __future__ import annotations

import sys
from pathlib import Path


ROOT = Path(__file__).parent.parent
SOURCE = ROOT

if str(SOURCE) not in sys.path:
    sys.path.insert(0, str(SOURCE))
