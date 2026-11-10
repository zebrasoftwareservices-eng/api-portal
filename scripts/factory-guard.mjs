// Statuses where the next worker is a Claude role (design, UX, review).
// Building, testing, and user testing run on Codex.
export const CLAUDE_STATUSES = new Set(['ready', 'designed', 'review']);

export function claudeConflicts(specs, exceptId) {
  return specs.filter((spec) => spec.id !== exceptId && CLAUDE_STATUSES.has(spec.status));
}

// A feature worktree still contains every spec file from the commit it branched at.
// The live status is the worktree that owns the spec, otherwise the main checkout.
export function chooseSpecStatuses(records) {
  const byId = new Map();
  for (const record of records) {
    const prev = byId.get(record.id);
    if (!prev || (record.owned && !prev.owned) || (!prev.owned && record.fromMain)) byId.set(record.id, record);
  }
  return [...byId.values()];
}
