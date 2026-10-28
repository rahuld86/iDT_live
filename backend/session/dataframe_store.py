"""DataFrameStore abstraction and the local-disk backend.

Heavy pandas DataFrames (the raw upload ``df`` up to ~500MB and the processed
``df_for_tree``) are far too large for Redis, so they are serialized to parquet
*outside* the process and referenced from :class:`SessionState` by an opaque
key. :class:`DataFrameStore` is the abstraction over that persistence;
:class:`LocalDiskDataFrameStore` is the Phase 1 backend writing parquet files to
local disk. A Phase 2 S3 backend plugs in behind the same interface.

Key / disk layout::

    key (opaque to callers):  "{session_id}/{name}"
    local disk file:          {DF_STORE_DIR}/{session_id}/{name}.parquet

The base directory is resolved from the ``DF_STORE_DIR`` environment variable
with a sensible default, and may be overridden via the constructor so tests can
point at a temporary directory (``LocalDiskDataFrameStore(base_dir=tmp_path)``).
"""

from __future__ import annotations

import os
import urllib.parse
import uuid
from abc import ABC, abstractmethod
from typing import List, Optional

import pandas as pd

# Default base directory for the disk backend when ``DF_STORE_DIR`` is unset.
DEFAULT_DF_STORE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "df_store")


def _resolve_store_dir(base_dir: Optional[str]) -> str:
    """Resolve the base directory for the disk backend.

    Precedence: explicit ``base_dir`` (test override) > ``DF_STORE_DIR`` env var
    > :data:`DEFAULT_DF_STORE_DIR`.
    """
    if base_dir:
        return base_dir
    return os.environ.get("DF_STORE_DIR") or DEFAULT_DF_STORE_DIR


def _make_key(session_id: str, name: str) -> str:
    """Build the opaque key ``"{session_id}/{name}"`` from its parts."""
    return f"{session_id}/{name}"


# Windows reserved device names that cannot be used as file/directory names
# (case-insensitive). A session_id encoding exactly equal to one of these is
# escaped so it stays a usable, reversible directory component on all platforms.
_WINDOWS_RESERVED_NAMES = frozenset(
    ["CON", "PRN", "AUX", "NUL"]
    + [f"COM{i}" for i in range(1, 10)]
    + [f"LPT{i}" for i in range(1, 10)]
)


def _fs_safe(component: str) -> str:
    """Encode a ``session_id`` into a single filesystem-safe path component.

    The opaque key keeps its canonical ``"{session_id}/{name}"`` form, but an
    arbitrary ``session_id`` cannot be used verbatim as an on-disk directory
    name: embedded path separators (``/``, ``\\``) and the special segments
    ``.`` / ``..`` would escape or collide with the intended session directory
    (e.g. a ``session_id`` of ``"0.."`` would resolve the atomic temp-file write
    path outside the created directory and raise ``FileNotFoundError``).

    We percent-encode the ``session_id`` with :func:`urllib.parse.quote` using
    ``safe=''`` (so ``/`` and ``:`` are escaped) and additionally escape every
    ``.`` as ``%2E``. Because ``.`` can no longer appear literally, the result
    can never equal ``.`` or ``..`` nor produce ``..`` segments, while remaining
    a single component with no separators. The encoding is deterministic and
    reversible via :func:`_fs_unsafe`, so ``list_keys``/``all_keys`` reconstruct
    the original ``session_id``. An empty ``session_id`` quotes to ``""``, which
    is not a usable directory name, so it is mapped to the sentinel ``"%00"``.
    Windows reserved device names (``NUL``, ``CON``, ``COM1`` ...) are escaped
    too so the component is usable on every platform.
    """
    encoded = urllib.parse.quote(component, safe="").replace(".", "%2E")
    # ``quote("")`` yields "" which is not a usable directory name; map the
    # empty session_id to a distinct, reversible sentinel component.
    if not encoded:
        return "%00"
    # Windows reserves a handful of device names (NUL, CON, COM1, ...) which are
    # not usable as directory names regardless of case. Percent-encode the first
    # character of such a component so it is no longer a reserved name while
    # staying reversible via ``unquote``.
    if encoded.upper() in _WINDOWS_RESERVED_NAMES:
        encoded = "%{:02X}".format(ord(encoded[0])) + encoded[1:]
    return encoded


def _fs_unsafe(component: str) -> str:
    """Inverse of :func:`_fs_safe`: recover the ``session_id`` from a dir name."""
    if component == "%00":
        return ""
    return urllib.parse.unquote(component)


class DataFrameStore(ABC):
    """Abstraction over persistence of heavy DataFrames as parquet.

    Implementations persist DataFrames outside the worker process and return an
    opaque key of the form ``"{session_id}/{name}"``. The key is the only thing
    callers (and :class:`SessionState`) hold onto -- its internal structure is an
    implementation detail of the store.
    """

    @abstractmethod
    def save_dataframe(self, session_id: str, name: str, df: pd.DataFrame) -> str:
        """Persist ``df`` for ``session_id`` under ``name`` and return its key.

        Overwriting an existing key replaces the prior content atomically.
        """
        raise NotImplementedError

    @abstractmethod
    def load_dataframe(self, key: str) -> pd.DataFrame:
        """Return the DataFrame previously saved under ``key``.

        Raises :class:`KeyError` when ``key`` references nothing previously
        written. Does not mutate the store.
        """
        raise NotImplementedError

    @abstractmethod
    def delete_dataframe(self, key: str) -> None:
        """Remove the DataFrame stored under ``key``. Idempotent."""
        raise NotImplementedError

    @abstractmethod
    def list_keys(self, session_id: str) -> List[str]:
        """Return the opaque keys currently stored for ``session_id``."""
        raise NotImplementedError

    @abstractmethod
    def all_keys(self) -> List[str]:
        """Return every opaque key across all sessions (used by cleanup)."""
        raise NotImplementedError


class LocalDiskDataFrameStore(DataFrameStore):
    """Local-disk (parquet) implementation of :class:`DataFrameStore` (Phase 1).

    Files are written to ``{base_dir}/{session_id}/{name}.parquet``. The base
    directory is resolved from ``DF_STORE_DIR`` (with a sensible default) unless
    overridden via ``base_dir`` for tests. Directories are created lazily on the
    first write.

    Parameters
    ----------
    base_dir:
        Optional override of the base directory. When ``None`` the value is read
        from ``DF_STORE_DIR`` (default :data:`DEFAULT_DF_STORE_DIR`).
    """

    def __init__(self, base_dir: Optional[str] = None) -> None:
        self._base_dir = _resolve_store_dir(base_dir)

    @property
    def base_dir(self) -> str:
        """Base directory under which per-session parquet files are written."""
        return self._base_dir

    def _path_for_key(self, key: str) -> str:
        """Map an opaque ``"{session_id}/{name}"`` key to its parquet path.

        ``name`` is one of the fixed heavy-frame names (``df`` / ``df_for_tree``)
        and never contains ``/``, whereas ``session_id`` may itself contain
        ``/`` (e.g. ``"a/b"`` or ``"../etc"``). We therefore split on the *last*
        ``/`` so the full ``session_id`` is recovered intact and then encoded to
        its filesystem-safe directory name.
        """
        session_id, _, name = key.rpartition("/")
        return os.path.join(self._session_dir(session_id), f"{name}.parquet")

    def _session_dir(self, session_id: str) -> str:
        """Directory holding a session's parquet files (fs-safe name)."""
        return os.path.join(self._base_dir, _fs_safe(session_id))

    def save_dataframe(self, session_id: str, name: str, df: pd.DataFrame) -> str:
        """Write ``df`` as parquet and return the opaque key.

        The session directory is created lazily. The write is atomic: the frame
        is written to a uniquely-named temp file in the same directory and then
        renamed over the destination, so a concurrent reader never observes a
        partially written file and an overwrite replaces prior content cleanly.
        """
        if df is None:
            raise ValueError("df must not be None")

        key = _make_key(session_id, name)
        dest_path = self._path_for_key(key)
        session_dir = self._session_dir(session_id)
        os.makedirs(session_dir, exist_ok=True)

        tmp_path = os.path.join(session_dir, f".{name}.{uuid.uuid4().hex}.parquet.tmp")
        try:
            df.to_parquet(tmp_path)
            os.replace(tmp_path, dest_path)  # atomic within the same filesystem
        finally:
            # Clean up the temp file if the rename never happened (e.g. error).
            if os.path.exists(tmp_path):
                try:
                    os.remove(tmp_path)
                except OSError:
                    pass
        return key

    def load_dataframe(self, key: str) -> pd.DataFrame:
        """Read and return the parquet stored under ``key``.

        Raises :class:`KeyError` if no file exists for ``key``.
        """
        path = self._path_for_key(key)
        if not os.path.exists(path):
            raise KeyError(key)
        return pd.read_parquet(path)

    def delete_dataframe(self, key: str) -> None:
        """Delete the parquet file for ``key``. Idempotent on a missing file."""
        path = self._path_for_key(key)
        try:
            os.remove(path)
        except FileNotFoundError:
            pass

    def list_keys(self, session_id: str) -> List[str]:
        """Return the opaque keys currently stored for ``session_id``."""
        session_dir = self._session_dir(session_id)
        if not os.path.isdir(session_dir):
            return []
        keys: List[str] = []
        for entry in os.listdir(session_dir):
            if entry.endswith(".parquet"):
                name = entry[: -len(".parquet")]
                keys.append(_make_key(session_id, name))
        return keys

    def all_keys(self) -> List[str]:
        """Return every opaque key across all sessions under the base dir."""
        if not os.path.isdir(self._base_dir):
            return []
        keys: List[str] = []
        for dir_name in os.listdir(self._base_dir):
            if not os.path.isdir(os.path.join(self._base_dir, dir_name)):
                continue
            keys.extend(self.list_keys(_fs_unsafe(dir_name)))
        return keys
