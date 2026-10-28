"""Property-based tests for the Redis-backed :class:`SessionStore`.

Property 2: Session metadata isolation (no cross-talk).
  Validates: Requirements 1.3, 1.4 -- a write for one session id never changes
  the state read back for a different session id.

Property 14: Fresh default on missing session.
  Validates: Requirements 11.4 -- ``get_session`` on an id with no stored state
  returns a fresh default ``SessionState`` without raising.

A ``fakeredis.FakeRedis(decode_responses=True)`` client is injected into the
store so no real Redis is required. A brand-new fake client (and therefore a
brand-new store) is built inside each test body so state never leaks across
Hypothesis examples.
"""

import fakeredis
from hypothesis import given
from hypothesis import strategies as st

from session.state import SessionState
from session.store_redis import SessionStore

# Reuse the SessionState strategy defined next to the data container's tests.
from tests.test_state import session_states


def _fresh_store() -> SessionStore:
    """Build a SessionStore backed by a fresh, isolated fakeredis client."""
    client = fakeredis.FakeRedis(decode_responses=True)
    return SessionStore(client=client)


# --- Property 2 ---------------------------------------------------------------


@given(
    s1=st.text(min_size=1, max_size=40),
    s2=st.text(min_size=1, max_size=40),
    state_a=session_states(),
    state_b=session_states(),
    save_b_first=st.booleans(),
)
def test_session_metadata_isolation(
    s1: str,
    s2: str,
    state_a: SessionState,
    state_b: SessionState,
    save_b_first: bool,
):
    """Property 2: Session metadata isolation (no cross-talk).

    For distinct session ids ``s1 != s2``, saving ``state_a`` under ``s1`` and
    ``state_b`` under ``s2`` (in either order) leaves each id readable as its
    own state: ``get_session(s1) == state_a`` and ``get_session(s2) == state_b``.

    **Validates: Requirements 1.3, 1.4**
    """
    # Constrain to distinct ids: identical ids are a different scenario
    # (overwrite), not isolation.
    if s1 == s2:
        return

    # Fresh, isolated store per example so no state leaks across examples.
    store = _fresh_store()

    # Save in both possible orders to show order-independence.
    if save_b_first:
        store.save_session(s2, state_b)
        store.save_session(s1, state_a)
    else:
        store.save_session(s1, state_a)
        store.save_session(s2, state_b)

    # Each id reads back exactly its own state, unaffected by the other write.
    assert store.get_session(s1) == state_a
    assert store.get_session(s2) == state_b


# --- Property 14 --------------------------------------------------------------


@given(session_id=st.text(min_size=1, max_size=60))
def test_fresh_default_on_missing_session(session_id: str):
    """Property 14: Fresh default on missing session.

    For any session id with no stored state, ``get_session`` returns a default
    ``SessionState`` without raising.

    **Validates: Requirements 11.4**
    """
    store = _fresh_store()

    # Nothing has been saved for this id -> a fresh default, no exception.
    result = store.get_session(session_id)

    assert result == SessionState()


# --- Unit examples (complement the properties) --------------------------------


def test_isolation_two_fixed_sessions():
    """Two distinct sessions keep independent state (example-based)."""
    store = _fresh_store()
    alice = SessionState(file_name="alice.csv", badflag="target", max_depth=3)
    bob = SessionState(file_name="bob.csv", badflag="label", max_depth=9)

    store.save_session("user:alice", alice)
    store.save_session("user:bob", bob)

    assert store.get_session("user:alice") == alice
    assert store.get_session("user:bob") == bob


def test_overwrite_does_not_affect_other_session():
    """Overwriting one session leaves another session untouched."""
    store = _fresh_store()
    first = SessionState(file_name="first.csv")
    other = SessionState(file_name="other.csv")

    store.save_session("user:a", first)
    store.save_session("user:b", other)

    # Overwrite user:a with new state.
    updated = SessionState(file_name="first-v2.csv", max_depth=12)
    store.save_session("user:a", updated)

    assert store.get_session("user:a") == updated
    assert store.get_session("user:b") == other


def test_missing_session_returns_default_example():
    """A never-saved id yields a fresh default SessionState (example-based)."""
    store = _fresh_store()
    assert store.get_session("user:never-seen") == SessionState()
