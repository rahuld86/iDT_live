"""Unit tests for the migrated ``/api/logout`` endpoint (task 14.2).

Exercises the Flask test client against the logout endpoint, migrated from a
no-op JWT-stateless handler to one that purges the user's session + heavy
DataFrame files via ``SessionManager.purge`` before returning the unchanged
success response.

To avoid real Redis + real JWT verification the ``app_client`` fixture follows
the same pattern as the other endpoint tests:

* monkeypatches ``app.session_manager`` with a :class:`SessionManager` built over
  a ``fakeredis``-backed :class:`SessionStore`, a temp-dir
  :class:`LocalDiskDataFrameStore`, and a generous :class:`DataFrameCache`;
* generates a *real* JWT via ``flask_jwt_extended.create_access_token`` so the
  ``@jwt_required()`` decorator passes and ``session_id_from_jwt()`` resolves to
  the stable id ``"user:test"``.

The tests assert both the response contract (unchanged by the migration) and the
purge effects (Redis session deleted, heavy files removed) plus that ``purge``
was invoked for the resolved session id.
"""

import pandas as pd

import fakeredis
import pytest

import app as app_module
from flask_jwt_extended import create_access_token
from session.cache import DataFrameCache
from session.dataframe_store import LocalDiskDataFrameStore
from session.manager import SessionManager
from session.state import SessionState
from session.store_redis import SessionStore

TEST_IDENTITY = "test"
TEST_SID = "user:test"


@pytest.fixture
def app_client(tmp_path):
    """Flask test client wired to a fake session_manager + a real JWT header.

    Returns ``(client, manager, df_store, auth_headers)`` where ``manager`` is the
    fake :class:`SessionManager` monkeypatched onto the app module and
    ``auth_headers`` carries a valid ``Authorization: Bearer <token>`` for
    identity ``"test"``.
    """
    client = fakeredis.FakeRedis(decode_responses=True)
    store = SessionStore(client=client)
    df_store = LocalDiskDataFrameStore(base_dir=str(tmp_path))
    cache = DataFrameCache(max_bytes=256 * 1024 * 1024)
    manager = SessionManager(store, df_store, cache)

    original_manager = app_module.session_manager
    app_module.session_manager = manager

    flask_app = app_module.app
    flask_app.config["TESTING"] = True

    with flask_app.app_context():
        token = create_access_token(identity=TEST_IDENTITY)
    auth_headers = {"Authorization": f"Bearer {token}"}

    test_client = flask_app.test_client()
    try:
        yield test_client, manager, df_store, auth_headers
    finally:
        app_module.session_manager = original_manager


def _populate_workspace(manager):
    """Persist a populated session + a heavy frame for TEST_SID."""
    state = manager.resolve(TEST_SID)
    state.badflag = "target"
    state.regression_flag = 1
    state.max_depth = 9
    df = pd.DataFrame({"a": [1, 2, 3], "b": [4, 5, 6]})
    manager.set_dataframe(TEST_SID, state, "df", df)
    manager.persist(TEST_SID, state)
    return state


# --------------------------------------------------------------------------- #
# Response contract (unchanged by the migration)
# --------------------------------------------------------------------------- #
def test_logout_returns_unchanged_success_contract(app_client):
    test_client, _manager, _df_store, auth_headers = app_client

    resp = test_client.post("/api/logout", headers=auth_headers)

    assert resp.status_code == 200
    assert resp.get_json() == {"message": "Logout successful"}


# --------------------------------------------------------------------------- #
# Purge effect: Redis session + heavy files removed
# --------------------------------------------------------------------------- #
def test_logout_purges_session_and_heavy_files(app_client):
    test_client, manager, df_store, auth_headers = app_client

    # Given a populated workspace (session metadata + a heavy parquet file).
    _populate_workspace(manager)
    assert df_store.list_keys(TEST_SID) != []

    # When the user logs out.
    resp = test_client.post("/api/logout", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.get_json() == {"message": "Logout successful"}

    # Then re-resolving the same id yields a brand-new default session...
    assert manager.resolve(TEST_SID) == SessionState()
    # ...and every heavy DataFrame file for the session is gone.
    assert df_store.list_keys(TEST_SID) == []


# --------------------------------------------------------------------------- #
# Purge invocation: purge called for the resolved session id
# --------------------------------------------------------------------------- #
def test_logout_invokes_purge_for_resolved_session_id(app_client):
    test_client, manager, _df_store, auth_headers = app_client

    calls = []
    original_purge = manager.purge

    def spy_purge(session_id):
        calls.append(session_id)
        return original_purge(session_id)

    manager.purge = spy_purge

    resp = test_client.post("/api/logout", headers=auth_headers)

    assert resp.status_code == 200
    assert resp.get_json() == {"message": "Logout successful"}
    # purge invoked exactly once for the resolved session id.
    assert calls == [TEST_SID]


# --------------------------------------------------------------------------- #
# Idempotence: logout with an empty workspace is a no-op purge
# --------------------------------------------------------------------------- #
def test_logout_empty_workspace_is_noop(app_client):
    test_client, manager, df_store, auth_headers = app_client

    resp = test_client.post("/api/logout", headers=auth_headers)

    assert resp.status_code == 200
    assert resp.get_json() == {"message": "Logout successful"}
    assert manager.resolve(TEST_SID) == SessionState()
    assert df_store.list_keys(TEST_SID) == []
