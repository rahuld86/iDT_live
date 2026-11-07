import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

// Use the project's existing compiler so tests need no browser or extra runner.
const source = readFileSync(new URL('../src/lib/tree-utils.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext },
}).outputText;
const { formatContinuousBound, formatContinuousRange, indexChildren, truncateText } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
);

test('child lookup preserves sibling order, duplicates, and original objects', () => {
  const nodes = [
    { node_number: 3, parent_node: 1 },
    { node_number: 1, parent_node: 0 },
    { node_number: 2, parent_node: 1 },
    { node_number: 2, parent_node: 1 },
    { node_number: 4, parent_node: 2 },
  ];
  const original = structuredClone(nodes);
  const index = indexChildren(nodes);
  assert.deepEqual(index.get(1), [nodes[0], nodes[2], nodes[3]]);
  assert.equal(index.get(2)[0], nodes[4]);
  assert.equal(index.has(4), false);
  assert.deepEqual(nodes, original);
  assert.equal(index.get(1)[0], nodes[0]);
});

test('empty input and strict parent matching behave like the original lookup', () => {
  assert.equal(indexChildren([]).size, 0);
  const nodes = [{ parent_node: 1 }, { parent_node: '1' }, { parent_node: NaN }];
  const index = indexChildren(nodes);
  for (const parent of [1, '1', NaN, 0, undefined]) {
    assert.deepEqual(index.get(parent) || [], nodes.filter(node => node.parent_node === parent));
  }
});

test('short labels and text exactly at the width limit remain unchanged', () => {
  assert.equal(truncateText('approve', 84, 11), 'approve');
  assert.equal(truncateText('Node 7', 80, 12), 'Node 7');
  assert.equal(truncateText('WW', 21.6, 12), 'WW');
  assert.equal(truncateText('', 80, 12), '');
});

test('long labels reserve space for the ellipsis', () => {
  assert.equal(truncateText('W'.repeat(10000), 80, 12), 'WWWWWW…');
  assert.equal(truncateText('approve', 0, 12), '…');
});

test('Unicode truncation preserves complete code points', () => {
  assert.equal(truncateText('审批😀', 24, 12), '审…');
  assert.equal(truncateText('😀😀😀', 24, 12), '😀…');
});

test('continuous bounds preserve significant decimal places for small values', () => {
  assert.equal(formatContinuousBound(11), '11');
  assert.equal(formatContinuousBound(8.7324), '8.7');
  assert.equal(formatContinuousBound(0.354633), '0.35');
  assert.equal(formatContinuousBound(0.0354633), '0.035');
  assert.equal(formatContinuousBound(0.0304633), '0.030');
  assert.equal(formatContinuousBound(-0.001), '-0.0010');
  assert.equal(formatContinuousBound('Parent'), null);
});

test('continuous range requires both numeric bounds', () => {
  assert.equal(formatContinuousRange(0.0304633, 8.7324), '[0.030, 8.7]');
  assert.equal(formatContinuousRange(null, 8.7324), null);
});
