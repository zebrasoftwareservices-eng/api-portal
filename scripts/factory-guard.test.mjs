import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseSpecStatuses, claudeConflicts, outsideOwnership, parsePorcelainZ, specIdFromBranch } from './factory-guard.mjs';

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

test('a feature branch yields the spec id, not the Linear number', () => {
  assert.equal(specIdFromBranch('feat/jso-232-003-backlog-fixes-001-002'), '003');
  assert.equal(specIdFromBranch('feat/jso-236-008-teams-and-roles-2'), '008');
  assert.equal(specIdFromBranch('feat/003-backlog-fixes-001-002'), '003');
  assert.equal(specIdFromBranch('main'), null);
});

test('frontend may edit its spec and the portal, not another spec or AGENTS.md', () => {
  const bad = outsideOwnership(
    'frontend-developer',
    [
      'apps/portal/app/page.tsx',
      'packages/ui/src/button.tsx',
      'docs/specs/003-backlog-fixes-001-002.md',
      'docs/specs/log/003.md',
      'docs/specs/001-kong-quickstart-slice.md',
      'AGENTS.md',
      'apps/server/src/import.ts',
    ],
    '003',
  );
  assert.deepEqual(bad, ['docs/specs/001-kong-quickstart-slice.md', 'AGENTS.md', 'apps/server/src/import.ts']);
});

test('qa may edit tests and the spec, not application code', () => {
  const bad = outsideOwnership(
    'qa-tester',
    ['apps/portal/e2e/backlog-live.test.ts', 'apps/portal/components/auth-form.test.tsx', 'tests/setup.ts', 'apps/portal/app/page.tsx', 'docs/specs/003-backlog-fixes-001-002.md'],
    '003',
  );
  assert.deepEqual(bad, ['apps/portal/app/page.tsx']);
});

test('user-tester may commit the report, not a screenshot or a test', () => {
  const bad = outsideOwnership(
    'user-tester',
    ['docs/uat/003/report.md', 'docs/uat/003/shot.png', 'apps/portal/e2e/backlog-live.test.ts', 'docs/specs/log/003.md'],
    '003',
  );
  assert.deepEqual(bad, ['docs/uat/003/shot.png', 'apps/portal/e2e/backlog-live.test.ts']);
});

test('a rename keeps both paths', () => {
  assert.deepEqual(parsePorcelainZ('R  AGENTS.md\0apps/portal/agents.md\0?? docs/specs/003-x.md\0'), [
    'AGENTS.md',
    'apps/portal/agents.md',
    'docs/specs/003-x.md',
  ]);
});
