"""Unit tests for the migrated data-setup endpoints (task 11.5).

Exercises the Flask test client against the data-setup endpoints migrated from
the legacy ``tree_state`` global to the session-scoped ``SessionManager``:
``/api/upload``, ``/api/setTarget``, ``/api/getRegressionFlag``,
``/api/getTypes``, ``/api/keepVar``, and ``/api/defineHP``.

To avoid real Redis + real JWT verification the ``app_client`` fixture:

* monkeypatches ``app.session_manager`` with a :class:`SessionManager` built over
  a ``fakeredis``-backed :class:`SessionStore`, a temp-dir
  :class:`LocalDiskDataFrameStore`, and a generous :class:`DataFrameCache`;
* generates a *real* JWT via ``flask_jwt_extended.create_access_token`` so the
  ``@jwt_required()`` decorators pass and ``session_id_from_jwt()`` resolves to
  the stable id ``"user:test"``.

The tests assert both the request/response contracts (unchanged by the
migration) and that the session state is correctly persisted (``df_key``,
``df_for_tree_key``, ``df_col``, ``badflag``, hyperparameters).
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

CSV_CONTENT = (
    "age,income,target\n"
    "25,50000,Yes\n"
    "40,80000,No\n"
    "33,60000,Yes\n"
    "52,120000,No\n"
)


@pytest.fixture
def app_client(tmp_path):
    """Flask test client wired to a fake session_manager + a real JWT header.

    Returns ``(client, manager, auth_headers)`` where ``manager`` is the fake
    :class:`SessionManager` monkeypatched onto the app module (so tests can
    resolve the persisted state for ``TEST_SID``) and ``auth_headers`` carries a
    valid ``Authorization: Bearer <token>`` for identity ``"test"``.
    """
    client = fakeredis.FakeRedis(decode_responses=True)
    store = SessionStore(client=client)
    df_store = LocalDiskDataFrameStore(base_dir=str(tmp_path))
    cache = DataFrameCache(max_bytes=256 * 1024 * 1024)
    manager = SessionManager(store, df_store, cache)

    # Swap the module-level session_manager for the fake one.
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


def _upload_csv(test_client, auth_headers, csv_content=CSV_CONTENT):
    """Helper: POST a small CSV as multipart/form-data to ``/api/upload``."""
    data = {"file": (io.BytesIO(csv_content.encode("utf-8")), "sample.csv")}
    return test_client.post(
        "/api/upload",
        data=data,
        content_type="multipart/form-data",
        headers=auth_headers,
    )


# --------------------------------------------------------------------------- #
# /api/upload
# --------------------------------------------------------------------------- #
def test_upload_returns_contract_and_persists_state(app_client):
    test_client, manager, auth_headers = app_client

    resp = _upload_csv(test_client, auth_headers)

    assert resp.status_code == 200
    body = resp.get_json()
    # Response contract unchanged.
    assert body["rows"] == 4
    assert body["columns"] == 3
    assert body["columnsList"] == ["age", "income", "target"]
    assert isinstance(body["sample"], list)
    assert body["sample"][0]["target"] == "Yes"

    # State persisted: df_key set + metadata.
    state = manager.resolve(TEST_SID)
    assert state.df_key is not None
    assert state.file_name is not None
    assert state.original_data_source is not None

    # The heavy frame is actually retrievable via the manager.
    df = manager.active_df(state)
    assert df is not None
    assert list(df.columns) == ["age", "income", "target"]
    assert len(df) == 4


# --------------------------------------------------------------------------- #
# /api/setTarget + /api/getRegressionFlag
# --------------------------------------------------------------------------- #
def test_set_target_before_upload_returns_400(app_client):
    test_client, _manager, auth_headers = app_client

    resp = test_client.post(
        "/api/setTarget",
        json={"target": "target", "regression_flag": 0},
        headers=auth_headers,
    )
    assert resp.status_code == 400
    assert "No data loaded" in resp.get_json()["error"]


def test_set_target_after_upload_persists_badflag(app_client):
    test_client, manager, auth_headers = app_client
    _upload_csv(test_client, auth_headers)

    resp = test_client.post(
        "/api/setTarget",
        json={"target": "target", "regression_flag": 0},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.get_json() == {"message": "Target variable set to target"}

    state = manager.resolve(TEST_SID)
    assert state.badflag == "target"
    assert state.regression_flag == 0


def test_set_target_unknown_column_returns_400(app_client):
    test_client, _manager, auth_headers = app_client
    _upload_csv(test_client, auth_headers)

    resp = test_client.post(
        "/api/setTarget",
        json={"target": "does_not_exist", "regression_flag": 0},
        headers=auth_headers,
    )
    assert resp.status_code == 400
    assert "not found in data" in resp.get_json()["error"]


def test_get_regression_flag_returns_persisted_value(app_client):
    test_client, _manager, auth_headers = app_client
    _upload_csv(test_client, auth_headers)
    test_client.post(
        "/api/setTarget",
        json={"target": "target", "regression_flag": 1},
        headers=auth_headers,
    )

    resp = test_client.get("/api/getRegressionFlag", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.get_json() == {"regression_flag": 1}


# --------------------------------------------------------------------------- #
# /api/getTypes
# --------------------------------------------------------------------------- #
def test_get_types_before_upload_returns_400(app_client):
    test_client, _manager, auth_headers = app_client

    resp = test_client.get("/api/getTypes", headers=auth_headers)
    assert resp.status_code == 400
    assert "No data loaded" in resp.get_json()["error"]


def test_get_types_after_upload_and_set_target(app_client):
    test_client, _manager, auth_headers = app_client
    _upload_csv(test_client, auth_headers)
    test_client.post(
        "/api/setTarget",
        json={"target": "target", "regression_flag": 0},
        headers=auth_headers,
    )

    resp = test_client.get("/api/getTypes", headers=auth_headers)
    assert resp.status_code == 200
    col_types = resp.get_json()
    # Target column excluded; remaining feature columns present.
    assert "target" not in col_types
    assert set(col_types.keys()) == {"age", "income"}


# --------------------------------------------------------------------------- #
# /api/keepVar
# --------------------------------------------------------------------------- #
def test_keep_var_persists_df_col_and_df_for_tree(app_client):
    test_client, manager, auth_headers = app_client
    _upload_csv(test_client, auth_headers)
    test_client.post(
        "/api/setTarget",
        json={"target": "target", "regression_flag": 0},
        headers=auth_headers,
    )

    resp = test_client.post(
        "/api/keepVar",
        json={"age": "numerical", "income": "numerical"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    body = resp.get_json()
    assert "columnsList" in body
    # Selected features plus the derived numeric 'badflag' column.
    assert set(body["columnsList"]) == {"age", "income", "badflag"}

    state = manager.resolve(TEST_SID)
    assert state.df_for_tree_key is not None
    assert state.df_col is not None
    # df_col stored as JSON-serializable rows.
    assert isinstance(state.df_col, list)
    assert {row["column_name"] for row in state.df_col} == {"age", "income"}

    # The processed heavy frame is retrievable and carries 'badflag'.
    df_for_tree = manager.active_df_for_tree(state)
    assert df_for_tree is not None
    assert "badflag" in df_for_tree.columns


# --------------------------------------------------------------------------- #
# /api/defineHP
# --------------------------------------------------------------------------- #
def test_define_hp_persists_hyperparameters(app_client):
    test_client, manager, auth_headers = app_client

    payload = {
        "max_depth": 7,
        "min_node_split": 300,
        "min_leaf_size": 50,
        "max_branches": 4,
        "criteria": "gini",
        "unique_var": 1,
        "monotonic": 1,
    }
    resp = test_client.post("/api/defineHP", json=payload, headers=auth_headers)
    assert resp.status_code == 200
    body = resp.get_json()
    for key, value in payload.items():
        assert body[key] == value

    state = manager.resolve(TEST_SID)
    assert state.max_depth == 7
    assert state.min_node_split == 300
    assert state.min_leaf_size == 50
    assert state.max_branches == 4
    assert state.criteria == "gini"
    assert state.unique_var == 1
    assert state.monotonic == 1


def test_define_hp_defaults_when_no_payload(app_client):
    test_client, manager, auth_headers = app_client

    resp = test_client.post("/api/defineHP", json={}, headers=auth_headers)
    assert resp.status_code == 200
    body = resp.get_json()
    assert body == {
        "max_depth": 5,
        "min_node_split": 500,
        "min_leaf_size": 100,
        "max_branches": 5,
        "criteria": "entropy",
        "unique_var": 0,
        "monotonic": 0,
    }

    state = manager.resolve(TEST_SID)
    assert state.max_depth == 5
    assert state.criteria == "entropy"
