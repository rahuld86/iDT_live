"""Protect subtree selection semantics while optimizing branch filtering."""

import pandas as pd
import pytest
from pandas.testing import assert_frame_equal

from util import del_subtree, next_node_to_split_node


@pytest.fixture
def tree():
    return pd.DataFrame({
        "node_number": [1, 2, 3, 4, 5],
        "parent_node": [0, 1, 1, 2, 2],
        "branch": [1.0, 1.1, 1.2, 1.11, 1.12],
        "leaf_flag": [0, 0, 1, 0, 0],
        "level": [0, 1, 1, 2, 2],
    }, index=[8, 4, 7, 1, 3])


def test_delete_subtree_keeps_parent_and_other_branches_without_mutating_inputs(tree):
    rows = pd.DataFrame({"node_number": [1, 2, 3, 4, 4, 5], "value": range(6)})
    original_tree, original_rows = tree.copy(deep=True), rows.copy(deep=True)
    remaining_tree, remaining_rows = del_subtree(tree, rows, 2)
    assert remaining_tree.node_number.tolist() == [1, 2, 3]
    assert remaining_rows.node_number.tolist() == [1, 2, 3]
    assert remaining_tree.index.tolist() == [0, 1, 2]
    assert remaining_rows.index.tolist() == [0, 1, 2]
    assert_frame_equal(tree, original_tree)
    assert_frame_equal(rows, original_rows)


def test_subtree_selection_preserves_row_order_depth_limit_and_helper_columns(tree):
    tree = tree.iloc[[0, 1, 2, 4, 3]].copy()
    assert next_node_to_split_node(tree, 3, 2) == 5
    assert tree["mark"].tolist() == [0, 1, 0, 1, 1]
    assert tree["branch_str"].tolist() == ["1", "1.1", "1.2", "1.12", "1.11"]
    assert next_node_to_split_node(tree, 2, 2) == 0


def test_deleting_leaf_preserves_all_nodes(tree):
    rows = pd.DataFrame({"node_number": [1, 2, 3, 4, 5]})
    remaining_tree, remaining_rows = del_subtree(tree, rows, 3)
    assert remaining_tree.node_number.tolist() == tree.node_number.tolist()
    assert_frame_equal(remaining_rows, rows)


def test_unknown_node_keeps_existing_error_contract(tree):
    with pytest.raises(ValueError, match="Node 99 not found in del_subtree"):
        del_subtree(tree, pd.DataFrame({"node_number": [1]}), 99)
    with pytest.raises(ValueError, match="Node 99 not found in next_node_to_split_node"):
        next_node_to_split_node(tree, 3, 99)
