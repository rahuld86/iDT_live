"""Pytest configuration and shared fixtures for the backend test suite.

This placeholder makes ``project_iDT_2/backend`` importable from tests and
provides a home for shared fixtures (fakeredis clients, temporary
DataFrameStore directories, Flask test clients) added in later tasks.
"""

import os
import sys

# Ensure the backend package root is importable from the tests package so that
# ``import session...`` and ``import app`` resolve when pytest is run from the
# backend directory.
BACKEND_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)
