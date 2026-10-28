"""Unit tests for the migrated export/import endpoints (task 13.3).

Exercises the Flask test client against the export/import endpoints migrated
from the legacy ``tree_state`` global to the session-scoped ``SessionManager``:
``/api/exportTree``, ``/api/downloadTree``, ``/api/importTree`` and
``/api/getImportDiagnostics``.

The ``app_client`` fixture mirrors ``tests/test_endpoints_tree_building.py``:

* monkeypatches ``app.session_manager`` with a :class:`SessionManager` built over
  a ``fakeredis``-backed :class:`SessionStore`, a temp-dir
  :class:`LocalDiskDataFrameStore`, and a generous :class:`DataFrameCache`;
* generates a *real* JWT via ``flask_jwt_extended.create_access_token`` so the
  ``@jwt_required()`` decorators pass and ``session_id_from_jwt()`` resolves to
  the stable id ``"user:test"``.

The tests assert the (unchanged) request/response contracts, that export output
is driven entirely by persisted session state, and that import populates the
session state (persisting ``df_key`` exactly once per heavy frame).
"""

import io
import json

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


def _make_csv(n_per_class: int = 30) -> str:
    rows = ["age,income,target"]
    for i in range(n_per_class):
        rows.append(f"{20 + (i % 10)},{30000 + (i % 5) * 1000},Yes")
    for i in range(n_per_class):
        rows.append(f"{50 + (i % 10)},{90000 + (i % 5) * 1000},No")
    return "\n".join(rows) + "\n"


CSV_CONTENT = _make_csv()


@pytest.fixture
def app_client(tmp_path):
    """Flask test client wired to a fake session_manager + a real JWT header.

    Returns ``(client, manager, auth_headers, tmp_path)``.
    """
    client = fakeredis.FakeRedis(decode_responses=True)
    store = SessionStore(client=client)
    df_store = LocalDiskDataFrameStore(base_dir=str(tmp_path / "dfstore"))
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
        yield test_client, manager, auth_headers, tmp_path
    finally:
        app_module.session_manager = original_manager


# --------------------------------------------------------------------------- #
# Helpers that drive a realistic data-setup -> build flow.
# --------------------------------------------------------------------------- #
def _upload_csv(test_client, auth_headers, csv_content=CSV_CONTENT):
    data = {"file": (io.BytesIO(csv_content.encode("utf-8")), "sample.csv")}
    return test_client.post(
        "/api/upload",
        data=data,
        content_type="multipart/form-data",
        headers=auth_headers,
    )


def _build_tree(test_client, auth_headers):
    """upload -> setTarget -> defineHP(small) -> keepVar -> autoTree."""
    resp = _upload_csv(test_client, auth_headers)
    assert resp.status_code == 200, resp.get_data(as_text=True)

    resp = test_client.post(
        "/api/setTarget",
        json={"target": "target", "regression_flag": 0},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.get_data(as_text=True)

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

    resp = test_client.post("/api/autoTree", headers=auth_headers)
    assert resp.status_code == 200, resp.get_data(as_text=True)


# --------------------------------------------------------------------------- #
# /api/exportTree
# --------------------------------------------------------------------------- #
def test_export_tree_before_any_tree_returns_400(app_client):
    test_client, _manager, auth_headers, _tmp = app_client

    resp = test_client.get("/api/exportTree", headers=auth_headers)
    assert resp.status_code == 400
    assert "No tree to export" in resp.get_json()["error"]


def test_export_tree_returns_persisted_config_mapper_node_master(app_client):
    test_client, manager, auth_headers, _tmp = app_client
    _build_tree(test_client, auth_headers)

    resp = test_client.get("/api/exportTree", headers=auth_headers)
    assert resp.status_code == 200, resp.get_data(as_text=True)
    body = resp.get_json()

    state = manager.resolve(TEST_SID)
    # The export dict is driven entirely by persisted session state.
    assert body["badflag"] == state.badflag
    assert body["max_depth"] == state.max_depth
    assert body["min_node_split"] == state.min_node_split
    assert body["criteria"] == state.criteria
    # mapper == persisted df_col; node_master == persisted node_master.
    assert body["mapper"] == state.df_col
    assert body["node_master"] == state.node_master
    assert isinstance(body["node_master"], list) and len(body["node_master"]) >= 1


# --------------------------------------------------------------------------- #
# /api/downloadTree
# --------------------------------------------------------------------------- #
def test_download_tree_before_any_tree_returns_400(app_client):
    test_client, _manager, auth_headers, _tmp = app_client

    resp = test_client.get("/api/downloadTree", headers=auth_headers)
    assert resp.status_code == 400
    assert "No tree to download" in resp.get_json()["error"]


def test_download_tree_returns_attachment_with_node_master(app_client):
    test_client, manager, auth_headers, _tmp = app_client
    _build_tree(test_client, auth_headers)

    resp = test_client.get("/api/downloadTree", headers=auth_headers)
    assert resp.status_code == 200, resp.get_data(as_text=True)
    # File-download branch: attachment Content-Disposition header.
    assert "attachment" in resp.headers.get("Content-Disposition", "")

    payload = json.loads(resp.get_data(as_text=True))
    state = manager.resolve(TEST_SID)
    assert "node_master" in payload
    assert payload["node_master"] == state.node_master


# --------------------------------------------------------------------------- #
# /api/importTree  (CSV-import branch)
# --------------------------------------------------------------------------- #
def test_import_tree_csv_branch_persists_df_key(app_client):
    """POST JSON with a .csv file_name hits the CSV-detected branch.

    Returns the upload-style response with ``is_csv_import=True`` and persists
    the heavy frame via ``df_key`` (single load).
    """
    test_client, manager, auth_headers, tmp_path = app_client

    csv_path = tmp_path / "import_data.csv"
    csv_path.write_text(CSV_CONTENT)

    resp = test_client.post(
        "/api/importTree",
        json={"file_name": str(csv_path)},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.get_data(as_text=True)
    body = resp.get_json()
    assert body["is_csv_import"] is True
    assert "columnsList" in body and "sample" in body
    assert body["rows"] == len(CSV_CONTENT.strip().splitlines()) - 1

    # df_key persisted; the heavy frame is hydratable from the store.
    state = manager.resolve(TEST_SID)
    assert state.df_key is not None
    df = manager.active_df(state)
    assert df is not None
    assert list(df.columns) == ["age", "income", "target"]


# --------------------------------------------------------------------------- #
# /api/importTree  (JSON tree-config branch)
# --------------------------------------------------------------------------- #
def test_import_tree_json_config_populates_session_state(app_client):
    """Import a full JSON tree config and assert session state is populated.

    A guaranteed-valid tree config is produced by building a tree and exporting
    it. The config is written to a ``.json`` file on disk; the ``file_name``
    *inside* that config is pointed at a real temp CSV so the data-reload
    (local-file CSV) branch loads data. Import is then driven by POSTing the
    path to the ``.json`` file (a non-``.csv`` ``file_name`` reaches the
    JSON-tree-config path rather than the CSV-import branch). Import must
    populate node_master (list), df_col (list), df_for_tree_key, df_key and
    X_col.
    """
    test_client, manager, auth_headers, tmp_path = app_client

    # 1) Build a real tree in a throwaway session-equivalent flow and export it.
    _build_tree(test_client, auth_headers)
    export_resp = test_client.get("/api/exportTree", headers=auth_headers)
    assert export_resp.status_code == 200, export_resp.get_data(as_text=True)
    config = export_resp.get_json()

    # 2) Point the embedded file_name at a real CSV so the data-reload CSV branch
    #    loads data, and write the config to a .json file on disk.
    csv_path = tmp_path / "reload_data.csv"
    csv_path.write_text(CSV_CONTENT)
    config["file_name"] = str(csv_path)

    config_path = tmp_path / "tree_config.json"
    config_path.write_text(json.dumps(config))

    # Purge to prove the import repopulates state from scratch.
    manager.purge(TEST_SID)
    cleared = manager.resolve(TEST_SID)
    assert cleared.node_master is None
    assert cleared.df_key is None

    # 3) Import the JSON tree config via the .json file path (JSON-config path).
    resp = test_client.post(
        "/api/importTree",
        json={"file_name": str(config_path)},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.get_data(as_text=True)
    body = resp.get_json()
    assert "node_master" in body
    assert isinstance(body["node_master"], list) and len(body["node_master"]) >= 1

    # 4) Assert the session state was populated from the import.
    state = manager.resolve(TEST_SID)
    assert isinstance(state.node_master, list) and len(state.node_master) >= 1
    assert isinstance(state.node_master[0], dict)
    assert isinstance(state.df_col, list) and len(state.df_col) >= 1
    assert state.df_for_tree_key is not None
    assert state.df_key is not None
    assert isinstance(state.X_col, list) and len(state.X_col) >= 1

    # Heavy frames hydratable from the store.
    assert manager.active_df(state) is not None
    df_for_tree = manager.active_df_for_tree(state)
    assert df_for_tree is not None
    assert "badflag" in df_for_tree.columns


def test_import_tree_json_config_missing_variable_returns_400(app_client):
    """A node_master referencing a variable absent from the data -> 400."""
    test_client, manager, auth_headers, tmp_path = app_client

    csv_path = tmp_path / "small.csv"
    csv_path.write_text(CSV_CONTENT)

    config = {
        "file_name": str(csv_path),
        "badflag": "target",
        "mapper": [
            {"column_name": "age", "datatype": "numerical"},
            {"column_name": "income", "datatype": "numerical"},
        ],
        # References a variable ("nonexistent") that is not in df_for_tree.
        "node_master": [
            {"node_number": 1, "variable": "nonexistent"},
        ],
    }
    # A non-.csv file_name reaches the JSON-tree-config path; the embedded
    # file_name (a .csv) drives the data reload.
    config_path = tmp_path / "bad_config.json"
    config_path.write_text(json.dumps(config))

    resp = test_client.post(
        "/api/importTree",
        json={"file_name": str(config_path)},
        headers=auth_headers,
    )
    assert resp.status_code == 400, resp.get_data(as_text=True)
    assert "not found in data" in resp.get_json()["error"]


# --------------------------------------------------------------------------- #
# /api/getImportDiagnostics
# --------------------------------------------------------------------------- #
def test_get_import_diagnostics_before_data_returns_400(app_client):
    test_client, _manager, auth_headers, _tmp = app_client

    resp = test_client.get("/api/getImportDiagnostics", headers=auth_headers)
    assert resp.status_code == 400
    assert "No data available" in resp.get_json()["error"]


def test_get_import_diagnostics_after_import_returns_info(app_client):
    test_client, _manager, auth_headers, tmp_path = app_client

    csv_path = tmp_path / "diag_data.csv"
    csv_path.write_text(CSV_CONTENT)

    # CSV-import branch sets df_key.
    resp = test_client.post(
        "/api/importTree",
        json={"file_name": str(csv_path)},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.get_data(as_text=True)

    resp = test_client.get("/api/getImportDiagnostics", headers=auth_headers)
    assert resp.status_code == 200, resp.get_data(as_text=True)
    diag = resp.get_json()
    assert "dataset_info" in diag
    assert diag["dataset_info"]["rows"] == len(CSV_CONTENT.strip().splitlines()) - 1
    assert diag["dataset_info"]["columns"] == 3
    assert "hyperparameters" in diag
    assert "columns_info" in diag and len(diag["columns_info"]) == 3
