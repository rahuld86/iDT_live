"""Session state isolation package.

Externalizes the former in-process ``tree_state`` global into a Redis-backed
session store (small metadata, the tree as JSON, DataFrame pointers) plus a
DataFrame store for heavy pandas frames. See the ``session-state-isolation``
spec for the full design.
"""

from .cache import DataFrameCache
from .cleanup import SessionCleanup
from .dataframe_store import DataFrameStore, LocalDiskDataFrameStore
from .identity import session_id_from_jwt
from .manager import SessionDataExpired, SessionManager
from .scheduler import start_cleanup_scheduler
from .state import SessionState
from .store_redis import SessionStore

__all__ = [
    "SessionState",
    "SessionStore",
    "DataFrameStore",
    "LocalDiskDataFrameStore",
    "DataFrameCache",
    "SessionManager",
    "SessionDataExpired",
    "SessionCleanup",
    "start_cleanup_scheduler",
    "session_id_from_jwt",
]
