"""Property-based tests for :class:`session.cleanup.SessionCleanup`.

Property 11: Cleanup safety (delete iff orphaned).
  Validates: Requirements 7.3, 7.4, 12.5 -- a sweep deletes a DataFrame key if
  and only if its owning session has no live key in the session store. Files for
  live sessions survive, orphaned files are removed, and the sweep is
  idempotent.

Each example builds a brand-new ``fakeredis`` client and a brand-new temporary
``DF_STORE_DIR`` so state never leaks across Hypothesis examples.
"""

import string
import tempfile

import fakeredis
import pandas as pd
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from session.cleanup import SessionCleanup
from session.dataframe_store import LocalDiskDataFrameStore
from session.state import SessionState
from session.store_redis import SessionStore

# --- Strategies ---------------------------------------------------------------

# Session ids: plain ids and the canonical ``user:{identity}`` form. Restricted
# to filesystem-friendly identity characters and no ``/`` (the key separator).
# Identity characters for generated session ids. We deliberately exclude ``.``
# here: the sweep maps a session id to an on-disk directory name, and leading/
# trailing dots (and the degenerate "." / "..") are normalized by some operating
# systems (e.g. Windows strips trailing dots), which would make two distinct
# session ids collide onto the same physical directory. Real identities are JWT
# subjects, so restricting to alphanumerics plus ``_``/``-`` keeps the test
# focused on cleanup semantics rather than OS path-normalization quirks. The
# ``user:{identity}`` branch still exercises the store's ``:``-escaping path.
_identity_chars = string.ascii_letters + string.digits + "_-"
_plain_ids = st.text(alphabet=_identity_chars, min_size=1, max_size=10)
_user_ids = st.builds(
    lambda s: f"user:{s}", st.text(alphabet=_identity_chars, min_size=1, max_size=10)
)
_session_ids = st.one_of(_plain_ids, _user_ids)

# The two heavy-frame names the store accepts.
_DF_NAMES = ["df", "df_for_tree"]


def _fresh_components():
    """Build a fresh (SessionStore, LocalDiskDataFrameStore, base_dir) triple."""
    client = fakeredis.FakeRedis(decode_responses=True)
    session_store = SessionStore(client=client)
    base_dir = tempfile.TemporaryDirectory()
    df_store = LocalDiskDataFrameStore(base_dir=base_dir.name)
    return session_store, df_store, base_dir


# --- Property 11 --------------------------------------------------------------


@settings(suppress_health_check=[HealthCheck.too_slow], max_examples=100)
@given(
    # Require session ids to be unique *after case-folding* so that no two map to
    # the same on-disk directory on a case-insensitive filesystem (e.g. Windows,
    # macOS). Each session must own a distinct storage namespace for the sweep's
    # per-key accounting to be observable; case-folded uniqueness captures that
    # invariant without depending on the host OS's path semantics.
    sessions=st.lists(_session_ids, min_size=0, max_size=6, unique_by=str.casefold),
    live_mask=st.data(),
    file_mask=st.data(),
)
def test_cleanup_deletes_iff_orphaned(sessions, live_mask, file_mask):
    """Property 11: Cleanup safety (delete iff orphaned).

    Over a random set of session ids, mark a random subset as *live* (by saving
    a session into the store) and write DataFrame files for a random subset
    (covering both live and non-live sessions). After ``sweep()``:

    * every key whose session is NOT live has been deleted (orphan removal);
    * every key whose session IS live survives (live files retained);
    * the returned count equals the number of orphaned keys deleted;
    * a second sweep deletes nothing and leaves live files intact (idempotent).

    **Validates: Requirements 7.3, 7.4, 12.5**
    """
    session_store, df_store, base_dir = _fresh_components()
    try:
        # Decide liveness and file presence per session.
        live = {
            sid: live_mask.draw(st.booleans(), label=f"live:{sid}") for sid in sessions
        }
        has_file = {
            sid: file_mask.draw(st.booleans(), label=f"file:{sid}") for sid in sessions
        }

        # Mark live sessions by persisting a default state (creates session:{id}).
        for sid, is_live in live.items():
            if is_live:
                session_store.save_session(sid, SessionState())

        # Write a DataFrame file for each session flagged to have one.
        written_keys = {}  # session_id -> key
        for sid in sessions:
            if has_file[sid]:
                name = _DF_NAMES[hash(sid) % len(_DF_NAMES)]
                key = df_store.save_dataframe(sid, name, pd.DataFrame({"a": [1, 2, 3]}))
                written_keys[sid] = key

        # Expected outcomes before the sweep.
        orphan_keys = {
            key for sid, key in written_keys.items() if not live[sid]
        }
        live_keys = {key for sid, key in written_keys.items() if live[sid]}

        cleanup = SessionCleanup(session_store, df_store)

        # --- First sweep ----------------------------------------------------
        deleted = cleanup.sweep()

        # Count equals number of orphaned keys deleted.
        assert deleted == len(orphan_keys)

        remaining = set(df_store.all_keys())

        # Orphaned keys are gone; live keys survive.
        assert remaining.isdisjoint(orphan_keys)
        assert live_keys.issubset(remaining)
        # No orphans remain and nothing extra appeared.
        assert remaining == live_keys

        # Live files are still loadable (delete iff orphaned, not iff file).
        for key in live_keys:
            loaded = df_store.load_dataframe(key)
            assert list(loaded["a"]) == [1, 2, 3]

        # --- Second sweep (idempotent) --------------------------------------
        deleted_again = cleanup.sweep()
        assert deleted_again == 0
        assert set(df_store.all_keys()) == live_keys
    finally:
        base_dir.cleanup()
