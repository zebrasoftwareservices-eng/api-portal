import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseSpecStatuses, claudeConflicts } from './factory-guard.mjs';

test('a second Claude stage is the conflict, and the spec already in that stage is not', () => {
  const specs = [
    { id: '007', status: 'review' },
    { id: '008', status: 'building' },
    { id: '009', status: 'ready' },
    { id: '010', status: 'testing' },
    { id: '011', status: 'uat' },
    { id: '012', status: 'designed' },
  ];
  assert.deepEqual(
    claudeConflicts(specs, '007').map((spec) => spec.id),
    ['009', '012'],
  );
  assert.deepEqual(claudeConflicts(specs, '009').map((spec) => spec.id), ['007', '012']);
});

test('a stale copy in another worktree does not outvote the main checkout', () => {
  const chosen = chooseSpecStatuses([
    { id: '006', status: 'review', owned: false, fromMain: true },
    { id: '006', status: 'review', owned: false, fromMain: false },
    { id: '007', status: 'draft', owned: true, fromMain: false },
    { id: '007', status: 'ready', owned: false, fromMain: true },
  ]);
  assert.deepEqual(
    chosen.map((spec) => [spec.id, spec.status]),
    [
      ['006', 'review'],
      ['007', 'draft'],
    ],
  );
  assert.deepEqual(claudeConflicts(chosen, null).map((spec) => spec.id), ['006']);
});
