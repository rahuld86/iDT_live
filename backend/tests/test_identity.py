"""Property-based tests for ``session_id_from_jwt`` (task 7.2).

``session_id_from_jwt`` calls ``get_jwt_identity()`` which normally requires a
live JWT request context. Rather than standing up Flask, we patch the name as it
was *imported into* ``session.identity`` (``session.identity.get_jwt_identity``)
so the helper resolves a controlled identity, then assert its contract.

Property 1: Deterministic, distinct session id per user.
Validates: Requirements 1.1, 1.2, 2.1, 2.3, 2.4 -- for any identity the id is
exactly ``"user:" + identity``; distinct identities yield distinct ids; and
resolving the same identity repeatedly is stable (deterministic).
"""

from unittest.mock import patch

from hypothesis import given
from hypothesis import strategies as st

from session.identity import session_id_from_jwt


# Identity strings match what the app passes to ``create_access_token`` -- plain
# usernames. We allow a broad range of non-empty text so the property holds for
# any identity the JWT could carry.
_identities = st.text(min_size=1, max_size=40)


# --- Unit tests (specific examples / edge cases) ------------------------------


def test_prefixes_identity_with_user():
    """A concrete identity maps to the documented ``user:{identity}`` form."""
    with patch("session.identity.get_jwt_identity", return_value="idfcuser"):
        assert session_id_from_jwt() == "user:idfcuser"


def test_identity_with_special_characters():
    """Identities with punctuation/spaces are prefixed verbatim (no mangling)."""
    with patch("session.identity.get_jwt_identity", return_value="a.b-c_d e"):
        assert session_id_from_jwt() == "user:a.b-c_d e"


# --- Property 1 ---------------------------------------------------------------


@given(identity=_identities)
def test_session_id_is_user_prefixed(identity):
    """Property 1 (shape): id is exactly ``"user:" + identity``.

    **Validates: Requirements 1.1, 1.2, 2.1, 2.3, 2.4**
    """
    with patch("session.identity.get_jwt_identity", return_value=identity):
        assert session_id_from_jwt() == f"user:{identity}"


@given(identity=_identities)
def test_session_id_is_deterministic(identity):
    """Property 1 (stability): repeated resolution of the same identity is stable.

    **Validates: Requirements 1.1, 1.2, 2.1, 2.3, 2.4**
    """
    with patch("session.identity.get_jwt_identity", return_value=identity):
        first = session_id_from_jwt()
        second = session_id_from_jwt()
    assert first == second


@given(data=st.data())
def test_distinct_identities_give_distinct_ids(data):
    """Property 1 (distinctness): different identities map to different ids.

    Two distinct identities never collide on the same session id, so two users
    can never share a workspace.

    **Validates: Requirements 1.1, 1.2, 2.1, 2.3, 2.4**
    """
    identity_a = data.draw(_identities)
    identity_b = data.draw(_identities.filter(lambda s: s != identity_a))

    with patch("session.identity.get_jwt_identity", return_value=identity_a):
        id_a = session_id_from_jwt()
    with patch("session.identity.get_jwt_identity", return_value=identity_b):
        id_b = session_id_from_jwt()

    assert id_a != id_b
