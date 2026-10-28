"""Unit tests for the migrated tree-building endpoints (task 12.4).

Exercises the Flask test client against the tree-building endpoints migrated
from the legacy ``tree_state`` global to the session-scoped ``SessionManager``:
``/api/initTree``, ``/api/autoTree``, ``/api/getTreeData``, ``/api/labelNode``,
and a node-slice endpoint (``/api/findVar``) that relies on ``node_datasets``
*rederivation* -- i.e. it must work end-to-end from persisted session state
without any persisted ``node_datasets``.

The ``app_client`` fixture mirrors ``tests/test_endpoints_data_setup.py``:

* monkeypatches ``app.session_manager`` with a :class:`SessionManager` built over
  a ``fakeredis``-backed :class:`SessionStore`, a temp-dir
  :class:`LocalDiskDataFrameStore`, and a generous :class:`DataFrameCache`;
* generates a *real* JWT via ``flask_jwt_extended.create_access_token`` so the
  ``@jwt_required()`` decorators pass and ``session_id_from_jwt()`` resolves to
  the stable id ``"user:test"``.

The tests assert the (unchanged) request/response contracts and that the tree
(``node_master``) + ``X_col`` are persisted as JSON on the session, and that the
rederivation path powers node-slice endpoints.
"""

import io

import fakeredis
import pytest

import app as app_module
from flask_jwt_extended import create_access_token
from session.cache import DataFrameCache
from session.dataframe_store import LocalDiskDataFrameStore
from session.manager import SessionManager
from session.store_redis import SessionStore

TEST_IDENTITY = "test"
TEST_SID = "user:test"

# A small but non-trivial CSV: two numeric features with a clean separation on
# ``age`` so build_tree can actually find a split, plus a binary target. Kept
# small so build_tree runs quickly.
def _make_csv(n_per_class: int = 30) -> str:
    rows = ["age,income,target"]
    # Class "Yes": younger, lower income
    for i in range(n_per_class):
        rows.append(f"{20 + (i % 10)},{30000 + (i % 5) * 1000},Yes")
    # Class "No": older, higher income
    for i in range(n_per_class):
        rows.append(f"{50 + (i % 10)},{90000 + (i % 5) * 1000},No")
    return "\n".join(rows) + "\n"


CSV_CONTENT = _make_csv()


@pytest.fixture
def app_client(tmp_path):
    """Flask test client wired to a fake session_manager + a real JWT header.

    Returns ``(client, manager, auth_headers)``.
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
        yield test_client, manager, auth_headers
    finally:
        app_module.session_manager = original_manager


# --------------------------------------------------------------------------- #
# Helpers that drive the realistic data-setup flow leading up to tree building.
# --------------------------------------------------------------------------- #
def _upload_csv(test_client, auth_headers, csv_content=CSV_CONTENT):
    data = {"file": (io.BytesIO(csv_content.encode("utf-8")), "sample.csv")}
    return test_client.post(
        "/api/upload",
        data=data,
        content_type="multipart/form-data",
        headers=auth_headers,
    )


def _setup_through_keepvar(test_client, auth_headers):
    """upload -> setTarget -> defineHP(small) -> keepVar.

    Uses small hyperparameters so the tiny CSV yields a buildable tree.
    """
    resp = _upload_csv(test_client, auth_headers)
    assert resp.status_code == 200, resp.get_data(as_text=True)

    resp = test_client.post(
        "/api/setTarget",
        json={"target": "target", "regression_flag": 0},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.get_data(as_text=True)

    # Small thresholds so build_tree can split the ~60-row dataset.
    resp = test_client.post(
        "/api/defineHP",
        json={
            "max_depth": 3,
            "min_node_split": 10,
            "min_leaf_size": 2,
            "max_branches": 2,
            "criteria": "entropy",
            "unique_var": 0,
            "monotonic": 0,
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.get_data(as_text=True)

    resp = test_client.post(
        "/api/keepVar",
        json={"age": "numerical", "income": "numerical"},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.get_data(as_text=True)


# --------------------------------------------------------------------------- #
# /api/initTree
# --------------------------------------------------------------------------- #
def test_init_tree_before_setup_returns_400(app_client):
    test_client, _manager, auth_headers = app_client

    resp = test_client.post("/api/initTree", headers=auth_headers)
    assert resp.status_code == 400
    assert "No processed data available" in resp.get_json()["error"]


def test_init_tree_persists_node_master_and_x_col(app_client):
    test_client, manager, auth_headers = app_client
    _setup_through_keepvar(test_client, auth_headers)

    resp = test_client.post("/api/initTree", headers=auth_headers)
    assert resp.status_code == 200, resp.get_data(as_text=True)
    body = resp.get_json()
    assert "node_master" in body
    assert isinstance(body["node_master"], list)
    assert len(body["node_master"]) >= 1  # at least the root node

    # node_master persisted as a JSON list (list of dicts) + X_col persisted.
    state = manager.resolve(TEST_SID)
    assert isinstance(state.node_master, list)
    assert len(state.node_master) >= 1
    assert isinstance(state.node_master[0], dict)
    assert isinstance(state.X_col, list)
    assert set(state.X_col) >= {"age", "income"} or len(state.X_col) >= 1
    # node_datasets is never persisted.
    assert not hasattr(state, "node_datasets")


# --------------------------------------------------------------------------- #
# /api/autoTree
# --------------------------------------------------------------------------- #
def test_auto_tree_before_setup_returns_400(app_client):
    test_client, _manager, auth_headers = app_client

    resp = test_client.post("/api/autoTree", headers=auth_headers)
    assert resp.status_code == 400
    assert "No processed data available" in resp.get_json()["error"]


def test_auto_tree_builds_and_persists_node_master(app_client):
    test_client, manager, auth_headers = app_client
    _setup_through_keepvar(test_client, auth_headers)

    resp = test_client.post("/api/autoTree", headers=auth_headers)
    assert resp.status_code == 200, resp.get_data(as_text=True)
    body = resp.get_json()
    assert "node_master" in body
    assert isinstance(body["node_master"], list)
    assert len(body["node_master"]) >= 1

    state = manager.resolve(TEST_SID)
    assert isinstance(state.node_master, list)
    assert len(state.node_master) >= 1
    assert isinstance(state.node_master[0], dict)


# --------------------------------------------------------------------------- #
# /api/getTreeData
# --------------------------------------------------------------------------- #
def test_get_tree_data_before_tree_returns_400(app_client):
    test_client, _manager, auth_headers = app_client

    resp = test_client.get("/api/getTreeData", headers=auth_headers)
    assert resp.status_code == 400
    assert "No tree data available" in resp.get_json()["error"]


def test_get_tree_data_returns_persisted_node_master(app_client):
    test_client, manager, auth_headers = app_client
    _setup_through_keepvar(test_client, auth_headers)
    test_client.post("/api/autoTree", headers=auth_headers)

    resp = test_client.get("/api/getTreeData", headers=auth_headers)
    assert resp.status_code == 200, resp.get_data(as_text=True)
    body = resp.get_json()
    assert "node_master" in body
    # The response equals the persisted JSON node_master.
    state = manager.resolve(TEST_SID)
    assert body["node_master"] == state.node_master


# --------------------------------------------------------------------------- #
# /api/labelNode  (tree-only write path)
# --------------------------------------------------------------------------- #
def test_label_node_before_tree_returns_400(app_client):
    test_client, _manager, auth_headers = app_client

    resp = test_client.post(
        "/api/labelNode",
        json={"node_number": 1, "label": "root"},
        headers=auth_headers,
    )
    assert resp.status_code == 400
    assert "No tree initialized" in resp.get_json()["error"]


def test_label_node_persists_label(app_client):
    test_client, manager, auth_headers = app_client
    _setup_through_keepvar(test_client, auth_headers)
    test_client.post("/api/initTree", headers=auth_headers)

    resp = test_client.post(
        "/api/labelNode",
        json={"node_number": 1, "label": "my-root-label"},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.get_data(as_text=True)
    body = resp.get_json()
    assert "node_master" in body

    # The label is persisted on node 1 in the JSON node_master.
    state = manager.resolve(TEST_SID)
    assert isinstance(state.node_master, list)
    root_rows = [r for r in state.node_master if r.get("node_number") == 1]
    assert root_rows, "root node (node_number == 1) should be present"
    # add_label writes the label into the ``node_label`` column.
    assert root_rows[0].get("node_label") == "my-root-label"


# --------------------------------------------------------------------------- #
# /api/findVar  (node-slice endpoint driven by rederivation)
# --------------------------------------------------------------------------- #
def test_find_var_before_tree_returns_400(app_client):
    test_client, _manager, auth_headers = app_client

    resp = test_client.post(
        "/api/findVar",
        json={"node_number": 1},
        headers=auth_headers,
    )
    assert resp.status_code == 400
    assert "No tree initialized" in resp.get_json()["error"]


def test_find_var_uses_rederivation_path(app_client):
    """findVar must work end-to-end from persisted state alone.

    After initTree, the session persists only ``node_master`` (JSON) +
    ``X_col`` + the ``df_for_tree`` *key* -- there is no persisted
    ``node_datasets``. A successful findVar therefore proves the rederivation
    path (``SessionManager.node_datasets_for``) is exercised.
    """
    test_client, manager, auth_headers = app_client
    _setup_through_keepvar(test_client, auth_headers)
    test_client.post("/api/initTree", headers=auth_headers)

    # Confirm the precondition: node_datasets is not persisted anywhere.
    state = manager.resolve(TEST_SID)
    assert not hasattr(state, "node_datasets")
    assert state.df_for_tree_key is not None

    resp = test_client.post(
        "/api/findVar",
        json={"node_number": 1},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.get_data(as_text=True)
    body = resp.get_json()
    assert "top_vars" in body
    assert isinstance(body["top_vars"], list)


def test_del_subtree_rederivation_and_persist(app_client):
    """delSubTree (node-slice WRITE) works via rederivation and persists.

    Build a full tree via autoTree, then delete the subtree at the root. The
    endpoint rederives node_datasets from persisted state (no persisted
    node_datasets) and persists the mutated node_master.
    """
    test_client, manager, auth_headers = app_client
    _setup_through_keepvar(test_client, auth_headers)
    test_client.post("/api/autoTree", headers=auth_headers)

    resp = test_client.post(
        "/api/delSubTree",
        json={"node_number": 1},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.get_data(as_text=True)
    body = resp.get_json()
    assert "node_master" in body
    assert isinstance(body["node_master"], list)

    # Root remains and is marked non-leaf (leaf_flag == 0) after delete.
    state = manager.resolve(TEST_SID)
    root_rows = [r for r in state.node_master if r.get("node_number") == 1]
    assert root_rows, "root node should still exist after delSubTree"
    assert root_rows[0].get("leaf_flag") == 0
