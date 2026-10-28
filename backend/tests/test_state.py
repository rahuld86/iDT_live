"""Property-based tests for the :class:`SessionState` data container.

Property 7: SessionState JSON round-trip.
Validates: Requirements 5.2 (a serialized-then-deserialized Session equals the
original).
"""

from hypothesis import given
from hypothesis import strategies as st

from session.state import SessionState


# --- Strategies ---------------------------------------------------------------

# JSON-serializable scalar values usable inside df_col / node_master dict rows.
# Restricted to the atoms json.dumps/json.loads round-trip without loss.
_json_scalars = st.one_of(
    st.none(),
    st.booleans(),
    st.integers(min_value=-(10**9), max_value=10**9),
    # Avoid NaN / inf: json produces non-standard tokens and NaN != NaN breaks
    # equality. allow_nan/allow_infinity are disabled for faithful round-trips.
    st.floats(allow_nan=False, allow_infinity=False, width=32),
    st.text(),
)

# A single row in df_col / node_master: a dict with string keys and JSON scalars.
_json_row = st.dictionaries(keys=st.text(), values=_json_scalars, max_size=5)

# Optional list-of-dict tables (df_col, node_master) or None.
_optional_rows = st.one_of(st.none(), st.lists(_json_row, max_size=5))

# Optional list of column-name strings (X_col) or None.
_optional_str_list = st.one_of(st.none(), st.lists(st.text(), max_size=8))

# Optional free-text string fields (identifiers, keys) or None.
_optional_text = st.one_of(st.none(), st.text())


@st.composite
def session_states(draw) -> SessionState:
    """Generate a random valid :class:`SessionState`.

    Every field is populated with a value drawn from its domain, keeping
    ``df_col`` / ``node_master`` as lists of JSON-serializable dicts and
    ``X_col`` as a list of strings so the JSON round-trip is lossless.
    """
    return SessionState(
        # identifiers / source
        file_name=draw(_optional_text),
        original_data_source=draw(_optional_text),
        # target & mode
        badflag=draw(_optional_text),
        regression_flag=draw(st.integers(min_value=0, max_value=1)),
        # hyperparameters
        max_depth=draw(st.integers(min_value=1, max_value=50)),
        min_node_split=draw(st.integers(min_value=1, max_value=10_000)),
        min_leaf_size=draw(st.integers(min_value=1, max_value=10_000)),
        max_branches=draw(st.integers(min_value=2, max_value=50)),
        criteria=draw(st.sampled_from(["entropy", "gini", "mse", "mae"])),
        unique_var=draw(st.integers(min_value=0, max_value=1)),
        monotonic=draw(st.integers(min_value=0, max_value=1)),
        # small tables
        df_col=draw(_optional_rows),
        node_master=draw(_optional_rows),
        X_col=draw(_optional_str_list),
        # heavy-frame pointers
        df_key=draw(_optional_text),
        df_for_tree_key=draw(_optional_text),
    )


# --- Property 7 ---------------------------------------------------------------


@given(state=session_states())
def test_session_state_json_round_trip(state: SessionState):
    """Property 7: SessionState JSON round-trip.

    ``SessionState.from_json(s.to_json()) == s`` for every randomly generated
    session, preserving config, ``badflag``, ``df_col``, ``node_master``,
    ``X_col``, and the DataFrame keys.

    **Validates: Requirements 5.2**
    """
    restored = SessionState.from_json(state.to_json())

    # Whole-object equality (dataclass __eq__ compares every field).
    assert restored == state

    # Spot-check the specific fields called out by the acceptance criterion so
    # a regression points at the offending field directly.
    assert restored.max_depth == state.max_depth
    assert restored.min_node_split == state.min_node_split
    assert restored.min_leaf_size == state.min_leaf_size
    assert restored.max_branches == state.max_branches
    assert restored.criteria == state.criteria
    assert restored.unique_var == state.unique_var
    assert restored.monotonic == state.monotonic
    assert restored.regression_flag == state.regression_flag
    assert restored.badflag == state.badflag
    assert restored.df_col == state.df_col
    assert restored.node_master == state.node_master
    assert restored.X_col == state.X_col
    assert restored.df_key == state.df_key
    assert restored.df_for_tree_key == state.df_for_tree_key


# --- Unit examples (complement the property) ----------------------------------


def test_round_trip_default_session():
    """A default SessionState survives the JSON round-trip unchanged."""
    state = SessionState()
    assert SessionState.from_json(state.to_json()) == state


def test_round_trip_fully_populated_session():
    """A fully populated SessionState survives the JSON round-trip unchanged."""
    state = SessionState(
        file_name="data.csv",
        original_data_source="s3://bucket/data.csv",
        badflag="target",
        regression_flag=1,
        max_depth=7,
        min_node_split=250,
        min_leaf_size=50,
        max_branches=4,
        criteria="gini",
        unique_var=1,
        monotonic=1,
        df_col=[{"column_name": "age", "datatype": "numeric"}],
        node_master=[{"node_id": 0, "parent": None, "label": "root"}],
        X_col=["age", "income"],
        df_key="user:alice/df",
        df_for_tree_key="user:alice/df_for_tree",
    )
    assert SessionState.from_json(state.to_json()) == state
