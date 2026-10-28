"""SessionState data container.

A plain data container that replaces the former ``TreeState`` global. It holds
only the *small* fields (config, identifiers, and JSON-serializable tables) plus
*pointers* (keys) to heavy DataFrames living in the ``DataFrameStore`` -- never
the DataFrames themselves. It is the unit serialized to / from Redis.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from typing import Optional


@dataclass
class SessionState:
    """Per-user session metadata persisted to Redis as JSON.

    Heavy pandas DataFrames are *not* stored here; only the opaque store keys
    (``df_key`` / ``df_for_tree_key``) that reference them in the DataFrameStore.
    ``node_datasets`` is intentionally absent -- it is rederived on demand from
    ``df_for_tree`` + ``df_col`` + ``node_master`` via ``util.create_node_datasets``.
    """

    # --- identifiers / source ---
    file_name: Optional[str] = None
    original_data_source: Optional[str] = None  # original path / URL / s3://

    # --- target & mode ---
    badflag: Optional[str] = None
    regression_flag: int = 0

    # --- hyperparameters ---
    max_depth: int = 5
    min_node_split: int = 500
    min_leaf_size: int = 100
    max_branches: int = 5
    criteria: str = "entropy"
    unique_var: int = 0
    monotonic: int = 0

    # --- small tables (JSON-serializable) ---
    df_col: Optional[list[dict]] = None       # column_name/datatype rows
    node_master: Optional[list[dict]] = None  # the tree (df_to_json_safe output)
    X_col: Optional[list[str]] = None         # feature column names

    # --- pointers to heavy DataFrames in DataFrameStore (NOT the data) ---
    df_key: Optional[str] = None              # raw uploaded df
    df_for_tree_key: Optional[str] = None     # processed features + 'badflag'

    def to_json(self) -> str:
        """Serialize this session to a JSON string for the SessionStore."""
        return json.dumps(asdict(self))

    @classmethod
    def from_json(cls, raw: str) -> "SessionState":
        """Deserialize a SessionState from a JSON string produced by ``to_json``."""
        return cls(**json.loads(raw))
