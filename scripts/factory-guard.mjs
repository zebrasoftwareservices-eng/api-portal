// Statuses where the next worker is a Claude role (design, UX, review).
// Building, testing, and user testing run on Codex.
export const CLAUDE_STATUSES = new Set(['ready', 'designed', 'review']);

export function claudeConflicts(specs, exceptId) {
  return specs.filter((spec) => spec.id !== exceptId && CLAUDE_STATUSES.has(spec.status));
}

// Branch names look like feat/jso-232-003-backlog-fixes-001-002. The spec id is
// the first 3-digit segment whose next segment is a word, not another number.
export function specIdFromBranch(branch) {
  const parts = String(branch || '').replace(/^feat\//, '').split('-');
  for (let i = 0; i < parts.length - 1; i++) {
    if (/^\d{3}$/.test(parts[i]) && !/^\d+$/.test(parts[i + 1])) return parts[i];
  }
  return null;
}

const ROOT_WORKSPACE = new Set(['package.json', 'pnpm-workspace.yaml', 'turbo.json', 'pnpm-lock.yaml']);

function clean(path) {
  return String(path || '').replaceAll('\\', '/').replace(/^\.\//, '');
}

function under(path, dir) {
  return path === dir || path.startsWith(`${dir}/`);
}

function isTestFile(path) {
  return /(?:^|\/)[^/]+\.(?:test|spec)\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(path);
}

function isCurrentSpec(path, specId) {
  if (!specId) return false;
  return new RegExp(`^docs/specs/${specId}-[^/]+\\.md$`).test(path);
}

function isCurrentLog(path, specId) {
  if (specId) return path === `docs/specs/log/${specId}.md`;
  return under(path, 'docs/specs/log');
}

// A role may edit the spec it is working on. It may not edit another spec.
export function pathAllowed(role, file, specId) {
  const path = clean(file);
  if (!path) return false;
  const specFile = isCurrentSpec(path, specId);
  const log = isCurrentLog(path, specId);
  switch (role) {
    case 'product-manager':
      return under(path, 'docs/specs') || path === 'docs/roadmap.md';
    case 'tech-lead':
      return specFile || log || path === 'apps/server/openapi.yaml' || under(path, 'docs/adr');
    case 'ui-designer':
      return under(path, 'docs/design') || log || specFile;
    case 'backend-developer':
      return (
        under(path, 'apps/server') ||
        under(path, 'packages/db') ||
        under(path, 'packages/sdk') ||
        under(path, 'deploy') ||
        /^packages\/adapter-[^/]+(\/|$)/.test(path) ||
        log ||
        specFile ||
        ROOT_WORKSPACE.has(path)
      );
    case 'frontend-developer':
      return under(path, 'apps/portal') || under(path, 'packages/ui') || log || specFile;
    case 'qa-tester':
      return isTestFile(path) || under(path, 'apps/portal/e2e') || under(path, 'tests') || log || specFile;
    case 'user-tester':
      return (specId ? path === `docs/uat/${specId}/report.md` : /^docs\/uat\/\d{3}\/report\.md$/.test(path)) || log || specFile;
    case 'researcher':
      return under(path, 'docs/research');
    default:
      return false;
  }
}

export function outsideOwnership(role, paths, specId) {
  return [...new Set(paths.map(clean).filter(Boolean))].filter((path) => !pathAllowed(role, path, specId));
}

// git status --porcelain -z. A rename is two records; both paths count.
export function parsePorcelainZ(text) {
  const parts = String(text || '').split('\0').filter((part) => part.length > 0);
  const paths = [];
  for (let i = 0; i < parts.length; i++) {
    const rec = parts[i];
    if (rec.length < 4) continue;
    const xy = rec.slice(0, 2);
    const path = rec.slice(3);
    if (xy.includes('R') || xy.includes('C')) {
      paths.push(path);
      const dest = parts[i + 1];
      if (dest && !/^[ MADRCU?!]{2} /.test(dest)) {
        paths.push(dest);
        i += 1;
      }
    } else {
      paths.push(path);
    }
  }
  return paths;
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
