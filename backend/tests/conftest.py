"""Make backend modules importable when running the regression test suite."""

import os
import sys

# Ensure the backend package root is importable from the tests package so that
# ``import session...`` and ``import app`` resolve when pytest is run from the
# backend directory.
BACKEND_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)
