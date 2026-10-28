"""Backward-compatibility and multi-worker integration tests (task 18).

These tests exercise the *whole* session-isolation stack end to end rather than a
single component, covering four properties from the design:

* **18.1 / Property 13** -- Externalized build equivalence (backward
  compatibility): the full ``upload -> setTarget -> getTypes -> keepVar ->
  autoTree`` flow driven through the real Flask app produces the *same*
  ``node_master`` as the legacy in-memory ``build_tree`` flow on identical
  inputs.
* **18.2 / Properties 2 & 3** -- Two-user isolation end to end: two JWT
  identities (``alice`` / ``bob``) with interleaved requests never see each
  other's metadata or heavy DataFrames.
* **18.3 / Property 5** -- Cross-worker persistence: a frame + metadata written
  by one ``SessionManager`` instance is read back equal by a *second* instance
  sharing the same Redis client and ``DF_STORE_DIR`` (separate per-worker
  caches).
* **18.4 / Properties 15 & 16** -- Logout-purge integration: after building a
  tree and calling ``/api/logout`` the Redis key and parquet files are gone and
  a subsequent authenticated request sees a fresh default workspace.

To avoid real Redis + real JWT verification each test builds a fresh
``fakeredis`` client + temp ``DF_STORE_DIR`` and monkeypatches
``app.session_manager``; JWTs are minted via
``flask_jwt_extended.create_access_token`` so ``@jwt_required()`` passes and
``session_id_from_jwt()`` resolves to ``"user:{identity}"``.
"""

import io

import fakeredis
import numpy as np
import pandas as pd
import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st
from hypothesis.extra.pandas import column, data_frames, range_indexes
from pandas.testing import assert_frame_equal

import app as app_module
from flask_jwt_extended import create_access_token
from session.cache import DataFrameCache
from session.dataframe_store import LocalDiskDataFrameStore
from session.manager import SessionManager
from session.state import SessionState
from session.store_redis import SessionStore
from util import build_tree, create_node_datasets, init_setup


# --------------------------------------------------------------------------- #
# Shared helpers
# --------------------------------------------------------------------------- #
_LARGE_CACHE = 256 * 1024 * 1024  # 256MB: never evicts in these small tests.


def _make_manager(tmp_path):
    """Build a SessionManager over fakeredis + a temp-dir disk store."""
    client = fakeredis.FakeRedis(decode_responses=True)
    store = SessionStore(client=client)
    df_store = LocalDiskDataFrameStore(base_dir=str(tmp_path))
    cache = DataFrameCache(max_bytes=_LARGE_CACHE)
    manager = SessionManager(store, df_store, cache)
    return manager, df_store, client


def _auth_headers(identity):
    """Mint a real JWT for ``identity`` and return an Authorization header."""
    with app_module.app.app_context():
        token = create_access_token(identity=identity)
    return {"Authorization": f"Bearer {token}"}


def _upload_csv(client, headers, csv_content, filename="sample.csv"):
    data = {"file": (io.BytesIO(csv_content.encode("utf-8")), filename)}
    return client.post(
        "/api/upload",
        data=data,
        content_type="multipart/form-data",
        headers=headers,
    )


def _legacy_node_master(csv_content, target, keep, hp):
    """Replicate the LEGACY in-memory build flow directly via util.

    Mirrors what ``keepVar`` + ``autoTree`` do, but entirely in-process with no
    session store: read the CSV, select the kept feature columns, build a
    numeric ``badflag`` via the same 2-value mapping (first unique -> 1, second
    -> 0, numeric passthrough), then build the tree and return ``node_master``.
    """
    df = pd.read_csv(io.StringIO(csv_content))

    feature_columns = [c for c, t in keep.items() if t in ("numerical", "categorical")]
    df_for_tree = df[feature_columns].copy()

    target_values = df[target]
    if target_values.dtype == "object":
        unique_values = target_values.unique()
        assert len(unique_values) == 2, "legacy flow expects a binary target"
        value_map = {unique_values[0]: 1, unique_values[1]: 0}
        df_for_tree["badflag"] = target_values.map(value_map)
    else:
        df_for_tree["badflag"] = target_values

    df_col = pd.DataFrame(
        [{"column_name": c, "datatype": t} for c, t in keep.items()]
    )

    node_master, _node_datasets = build_tree(
        df_for_tree,
        "badflag",
        hp["max_depth"],
        hp["min_node_split"],
        hp["min_leaf_size"],
        hp["max_branches"],
        df_col,
        regression_flag=0,
        monotonic=0,
        unique_var=0,
    )
    return node_master


def _drive_full_flow(client, headers, csv_content, target, keep, hp):
    """Drive upload -> setTarget -> getTypes -> keepVar -> autoTree via Flask."""
    resp = _upload_csv(client, headers, csv_content)
    assert resp.status_code == 200, resp.get_data(as_text=True)

    resp = client.post(
        "/api/defineHP",
        json=hp,
        headers=headers,
    )
    assert resp.status_code == 200, resp.get_data(as_text=True)

    resp = client.post(
        "/api/setTarget",
        json={"target": target, "regression_flag": 0},
        headers=headers,
    )
    assert resp.status_code == 200, resp.get_data(as_text=True)

    resp = client.get("/api/getTypes", headers=headers)
    assert resp.status_code == 200, resp.get_data(as_text=True)

    resp = client.post("/api/keepVar", json=keep, headers=headers)
    assert resp.status_code == 200, resp.get_data(as_text=True)

    resp = client.post("/api/autoTree", headers=headers)
    assert resp.status_code == 200, resp.get_data(as_text=True)
    return resp.get_json()["node_master"]


# A small, deterministic, clearly-separable dataset so ``build_tree`` produces a
# real multi-node tree. "Yes" is young + low income; "No" is old + high income.
def _separable_csv(n_per_class=25):
    rows = ["age,income,target"]
    for i in range(n_per_class):
        rows.append(f"{20 + (i % 8)},{30000 + (i % 5) * 500},Yes")
    for i in range(n_per_class):
        rows.append(f"{55 + (i % 8)},{95000 + (i % 5) * 500},No")
    return "\n".join(rows) + "\n"


_SMALL_HP = {
    "max_depth": 3,
    "min_node_split": 10,
    "min_leaf_size": 2,
    "max_branches": 2,
    "criteria": "entropy",
    "unique_var": 0,
    "monotonic": 0,
}


# --------------------------------------------------------------------------- #
# 18.1 -- Property 13: Externalized build equivalence (backward compatibility)
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize(
    "csv_content",
    [
        _separable_csv(25),
        _separable_csv(40),
    ],
)
def test_externalized_build_equals_legacy_flow(tmp_path, csv_content):
    """Property 13: Externalized build equivalence (backward compatibility).

    **Validates: Requirements 10.3**

    Running the full ``upload -> setTarget -> getTypes -> keepVar -> autoTree``
    sequence through the session-backed Flask app yields the same
    ``node_master`` as the legacy in-memory ``build_tree`` flow for the same
    inputs.
    """
    manager, _df_store, _client = _make_manager(tmp_path)
    original_manager = app_module.session_manager
    app_module.session_manager = manager
    app_module.app.config["TESTING"] = True
    try:
        test_client = app_module.app.test_client()
        headers = _auth_headers("compat-user")

        target = "target"
        keep = {"age": "numerical", "income": "numerical"}

        api_node_master = _drive_full_flow(
            test_client, headers, csv_content, target, keep, _SMALL_HP
        )

        legacy_nm = _legacy_node_master(csv_content, target, keep, _SMALL_HP)
        legacy_node_master = app_module.df_to_json_safe(legacy_nm)

        assert api_node_master == legacy_node_master
    finally:
        app_module.session_manager = original_manager


# --------------------------------------------------------------------------- #
# 18.2 -- Properties 2 & 3: two-user isolation (end to end)
# --------------------------------------------------------------------------- #
# A second, structurally-different dataset for "bob" so a cross-talk bug would
# be observable (different columns, different target name, different values).
def _bob_csv(n_per_class=25):
    rows = ["height,weight,label"]
    for i in range(n_per_class):
        rows.append(f"{150 + (i % 6)},{50 + (i % 4)},Low")
    for i in range(n_per_class):
        rows.append(f"{185 + (i % 6)},{95 + (i % 4)},High")
    return "\n".join(rows) + "\n"


def test_two_user_isolation_end_to_end(tmp_path):
    """Properties 2 & 3: two-user metadata + heavy-DataFrame isolation.

    **Validates: Requirements 1.3, 1.4, 1.5**

    Alice and Bob upload *different* CSVs, set *different* targets + HPs, and
    build trees with their requests interleaved. Each user only ever observes
    their own data: distinct sessions, distinct df keys, distinct hydrated
    frames, and endpoint reads that reflect only the requester's inputs.
    """
    manager, df_store, _redis = _make_manager(tmp_path)
    original_manager = app_module.session_manager
    app_module.session_manager = manager
    app_module.app.config["TESTING"] = True
    try:
        client = app_module.app.test_client()
        alice = _auth_headers("alice")
        bob = _auth_headers("bob")

        alice_csv = _separable_csv(25)   # age,income,target
        bob_csv = _bob_csv(25)           # height,weight,label

        # --- interleave the two users' requests ---
        assert _upload_csv(client, alice, alice_csv).status_code == 200
        assert _upload_csv(client, bob, bob_csv).status_code == 200

        # Alice sets a classification target (regression_flag 0); Bob sets a
        # DIFFERENT target name and a DIFFERENT regression_flag (1) so the
        # getRegressionFlag read is a clear isolation signal.
        assert client.post(
            "/api/setTarget",
            json={"target": "target", "regression_flag": 0},
            headers=alice,
        ).status_code == 200
        assert client.post(
            "/api/setTarget",
            json={"target": "label", "regression_flag": 1},
            headers=bob,
        ).status_code == 200

        # Interleaved getTypes: each must reflect only that user's columns.
        alice_types = client.get("/api/getTypes", headers=alice).get_json()
        bob_types = client.get("/api/getTypes", headers=bob).get_json()
        assert set(alice_types.keys()) == {"age", "income"}
        assert set(bob_types.keys()) == {"height", "weight"}

        # getRegressionFlag never crosses over.
        assert client.get(
            "/api/getRegressionFlag", headers=alice
        ).get_json() == {"regression_flag": 0}
        assert client.get(
            "/api/getRegressionFlag", headers=bob
        ).get_json() == {"regression_flag": 1}

        # Different HPs per user.
        assert client.post(
            "/api/defineHP", json=_SMALL_HP, headers=alice
        ).status_code == 200
        bob_hp = dict(_SMALL_HP, max_depth=2, max_branches=2)
        assert client.post(
            "/api/defineHP", json=bob_hp, headers=bob
        ).status_code == 200

        # keepVar for each (interleaved) then build trees (interleaved).
        assert client.post(
            "/api/keepVar",
            json={"age": "numerical", "income": "numerical"},
            headers=alice,
        ).status_code == 200
        assert client.post(
            "/api/keepVar",
            json={"height": "numerical", "weight": "numerical"},
            headers=bob,
        ).status_code == 200

        alice_tree = client.post("/api/autoTree", headers=alice).get_json()["node_master"]
        bob_tree = client.post("/api/autoTree", headers=bob).get_json()["node_master"]

        # exportTree reflects each user's own target, never the other's.
        alice_export = client.get("/api/exportTree", headers=alice).get_json()
        bob_export = client.get("/api/exportTree", headers=bob).get_json()
        assert alice_export["badflag"] == "target"
        assert bob_export["badflag"] == "label"

        # --- session / key / frame level isolation ---
        alice_state = manager.resolve("user:alice")
        bob_state = manager.resolve("user:bob")

        # Distinct sessions resolve to distinct df keys.
        assert alice_state.df_key == "user:alice/df"
        assert bob_state.df_key == "user:bob/df"
        assert alice_state.df_key != bob_state.df_key
        assert alice_state.df_for_tree_key != bob_state.df_for_tree_key

        # The hydrated raw frames differ (different columns entirely).
        alice_df = manager.active_df(alice_state)
        bob_df = manager.active_df(bob_state)
        assert list(alice_df.columns) == ["age", "income", "target"]
        assert list(bob_df.columns) == ["height", "weight", "label"]

        # Each session's files live under its own namespace only.
        assert set(df_store.list_keys("user:alice")) == {
            "user:alice/df",
            "user:alice/df_for_tree",
        }
        assert set(df_store.list_keys("user:bob")) == {
            "user:bob/df",
            "user:bob/df_for_tree",
        }

        # The two trees are genuinely different objects (different inputs).
        assert alice_tree != bob_tree
    finally:
        app_module.session_manager = original_manager


# --------------------------------------------------------------------------- #
# 18.3 -- Property 5: Cross-worker persistence
# --------------------------------------------------------------------------- #
# Strategy: small frames with a couple of numeric columns and a modest row
# count, so parquet round-trips are fast and dtypes are stable.
_cross_worker_frames = data_frames(
    columns=[
        column("x", elements=st.integers(min_value=-1000, max_value=1000), dtype="int64"),
        column("y", elements=st.floats(min_value=-1e6, max_value=1e6, allow_nan=False, allow_infinity=False), dtype="float64"),
    ],
    index=range_indexes(min_size=1, max_size=40),
)


@settings(
    max_examples=25,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.function_scoped_fixture],
)
@given(
    df=_cross_worker_frames,
    badflag=st.sampled_from(["target", "label", "y_flag"]),
    max_depth=st.integers(min_value=1, max_value=9),
    regression_flag=st.integers(min_value=0, max_value=1),
)
def test_cross_worker_persistence(tmp_path_factory, df, badflag, max_depth, regression_flag):
    """Property 5: Cross-worker persistence.

    **Validates: Requirements 3.2, 3.3**

    Simulate two worker instances by building two separate ``SessionManager``
    instances that SHARE the same Redis client and the same ``DF_STORE_DIR`` but
    each have their OWN ``DataFrameCache``. A frame + metadata written via
    instance A is read back equal by instance B; a ``df_for_tree`` round trip
    rederives the same ``node_datasets`` across instances.
    """
    tmp_path = tmp_path_factory.mktemp("cross_worker")

    # Shared Redis + shared disk; separate caches == separate workers.
    shared_redis = fakeredis.FakeRedis(decode_responses=True)
    shared_dir = str(tmp_path)

    store_a = SessionStore(client=shared_redis)
    store_b = SessionStore(client=shared_redis)
    df_store_a = LocalDiskDataFrameStore(base_dir=shared_dir)
    df_store_b = LocalDiskDataFrameStore(base_dir=shared_dir)
    manager_a = SessionManager(store_a, df_store_a, DataFrameCache(max_bytes=_LARGE_CACHE))
    manager_b = SessionManager(store_b, df_store_b, DataFrameCache(max_bytes=_LARGE_CACHE))

    sid = "user:worker-shared"

    # --- Worker A writes a raw df + metadata and persists ---
    state_a = manager_a.resolve(sid)
    state_a.badflag = badflag
    state_a.regression_flag = regression_flag
    state_a.max_depth = max_depth
    state_a.df_col = [
        {"column_name": "x", "datatype": "numerical"},
        {"column_name": "y", "datatype": "numerical"},
    ]
    manager_a.set_dataframe(sid, state_a, "df", df)
    manager_a.persist(sid, state_a)

    # --- Worker B reads back metadata (cold cache) and the df ---
    state_b = manager_b.resolve(sid)
    assert state_b.badflag == badflag
    assert state_b.regression_flag == regression_flag
    assert state_b.max_depth == max_depth
    assert state_b.df_col == state_a.df_col
    assert state_b.df_key == state_a.df_key

    df_read_b = manager_b.active_df(state_b)
    assert df_read_b is not None
    assert_frame_equal(df_read_b, df)

    # --- df_for_tree round trip across instances + node_datasets rederivation ---
    df_for_tree = df.copy()
    # A simple numeric badflag column so create_node_datasets has what it needs.
    df_for_tree["badflag"] = (df_for_tree["x"] >= 0).astype(int)

    key = manager_a.set_dataframe(sid, state_a, "df_for_tree", df_for_tree)
    state_a.node_master = app_module.df_to_json_safe(
        init_setup(df_for_tree, "badflag", max_depth, 500, 100, 5)[1]
    )
    manager_a.persist(sid, state_a)

    # Instance B re-resolves and hydrates the processed frame from shared disk.
    state_b2 = manager_b.resolve(sid)
    assert state_b2.df_for_tree_key == key
    df_for_tree_b = manager_b.active_df_for_tree(state_b2)
    assert_frame_equal(df_for_tree_b, df_for_tree)

    # node_datasets rederived via instance B equals a direct create_node_datasets
    # on the same inputs (equivalent across workers).
    mapper = pd.DataFrame(state_b2.df_col)
    node_master_df = pd.DataFrame(state_b2.node_master)
    _nm, expected_nd = create_node_datasets(df_for_tree_b, mapper, node_master_df)
    actual_nd = manager_b.node_datasets_for(state_b2)
    assert_frame_equal(
        actual_nd.reset_index(drop=True),
        expected_nd.reset_index(drop=True),
    )


# --------------------------------------------------------------------------- #
# 18.4 -- Properties 15 & 16: logout-purge integration
# --------------------------------------------------------------------------- #
def test_logout_purge_integration_fresh_workspace(tmp_path):
    """Properties 15 & 16: logout purges session + files; no recovery after.

    **Validates: Requirements 12.1, 12.4, 11.4**

    Build a real tree for a user through the Flask app, call ``/api/logout``,
    then assert the Redis session key and the parquet files for the session are
    gone and the session re-resolves to a fresh default. A subsequent
    authenticated request sees a brand-new default workspace (``getTreeData`` ->
    400 "No tree data available"; ``getRegressionFlag`` -> default 0).
    """
    manager, df_store, redis_client = _make_manager(tmp_path)
    original_manager = app_module.session_manager
    app_module.session_manager = manager
    app_module.app.config["TESTING"] = True
    try:
        client = app_module.app.test_client()
        headers = _auth_headers("purge-user")
        sid = "user:purge-user"

        # Build a full tree so the workspace is genuinely populated.
        _drive_full_flow(
            client,
            headers,
            _separable_csv(25),
            "target",
            {"age": "numerical", "income": "numerical"},
            _SMALL_HP,
        )

        # Precondition: session present in Redis + parquet files on disk.
        assert redis_client.exists("session:" + sid)
        assert df_store.list_keys(sid) != []

        # --- logout ---
        resp = client.post("/api/logout", headers=headers)
        assert resp.status_code == 200
        assert resp.get_json() == {"message": "Logout successful"}

        # Property 15: Redis key gone + no parquet files remain.
        assert not redis_client.exists("session:" + sid)
        assert df_store.list_keys(sid) == []
        # Re-resolve yields a brand-new default SessionState.
        assert manager.resolve(sid) == SessionState()

        # Property 16 / 11.4: a subsequent authenticated request sees a fresh
        # default workspace with no recovered work.
        tree_resp = client.get("/api/getTreeData", headers=headers)
        assert tree_resp.status_code == 400
        assert "No tree data available" in tree_resp.get_json()["error"]

        reg_resp = client.get("/api/getRegressionFlag", headers=headers)
        assert reg_resp.status_code == 200
        assert reg_resp.get_json() == {"regression_flag": 0}
    finally:
        app_module.session_manager = original_manager
