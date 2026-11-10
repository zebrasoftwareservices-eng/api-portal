// Spec checkboxes are the task board. Linear keeps one feature issue per spec,
// plus a child issue only for a durable blocker, major bug, or blocking review finding.
// These helpers edit the spec text. They do not call Linear.

const HEADINGS = {
  task: '### Tasks',
  bug: '### Bugs',
  'follow-up': '### Follow-ups',
  deferred: '### Deferred Linear',
};

const TASK_LINE = /^(\s*-\s\[)([ xX])(\]\s\[(backend|frontend|qa)\][ \t]*)(.*)$/;
const BUG_LINE = /^(\s*-\s\[)([ xX])(\][ \t]*)(.*)$/;
const KEY_RE = /\b([A-Za-z][A-Za-z0-9]*-\d+)\b/g;

export function keysIn(text) {
  return [...String(text).matchAll(KEY_RE)].map((match) => match[1]);
}

function isPlaceholder(text) {
  const value = text.trim();
  return value === '…' || value === '...' || /^none found\.?$/i.test(value);
}

export function sectionRange(text, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`^${escaped}[ \\t]*\\n`, 'm').exec(text);
  if (!match) return null;
  const start = match.index + match[0].length;
  const next = text.slice(start).search(/^#{1,3}[ \t]/m);
  const end = next === -1 ? text.length : start + next;
  return { start, end };
}

function withSection(text, heading) {
  const doc = text.endsWith('\n') ? text : `${text}\n`;
  if (sectionRange(doc, heading)) return doc;
  return `${doc}\n${heading}\n\n`;
}

function parseLine(kind, line) {
  const match = line.match(kind === 'task' ? TASK_LINE : BUG_LINE);
  if (!match) return null;
  const text = (kind === 'task' ? match[5] : match[4]).trim();
  if (!text || isPlaceholder(text)) return null;
  return { mark: match[2], owner: kind === 'task' ? match[4] : null, text, keys: keysIn(text) };
}

function collect(text, kind) {
  const range = sectionRange(text, HEADINGS[kind]);
  if (!range) return [];
  const items = [];
  for (const line of text.slice(range.start, range.end).split('\n')) {
    const parsed = parseLine(kind, line);
    if (!parsed) continue;
    items.push({
      done: parsed.mark !== ' ',
      owner: parsed.owner,
      text: parsed.text,
      key: parsed.keys.length === 1 ? parsed.keys[0] : null,
      keys: parsed.keys,
    });
  }
  return items;
}

function split(items) {
  return { open: items.filter((item) => !item.done), done: items.filter((item) => item.done) };
}

/** Status, feature key, and checkbox lines. No spec prose and no Linear comments. */
export function readModel({ id, status, title, linear, text }) {
  return {
    id,
    status,
    title,
    linear: linear || null,
    tasks: split(collect(text, 'task')),
    bugs: split(collect(text, 'bug')),
  };
}

function score(parsed, needle) {
  if (parsed.keys.some((key) => key.toLowerCase() === needle)) return 2;
  if (parsed.text.toLowerCase() === needle) return 2;
  if (parsed.text.toLowerCase().includes(needle)) return 1;
  return 0;
}

/**
 * Tick or untick the one task or bug line that matches. An exact line or key wins
 * over a shorter substring, so "Add the widget" does not also hit "Add the widget tray".
 */
export function tick(text, kind, match, done) {
  if (kind !== 'task' && kind !== 'bug') return { ok: false, error: 'kind must be task or bug' };
  const needle = String(match || '').trim().toLowerCase();
  if (!needle) return { ok: false, error: 'match is required' };
  const heading = HEADINGS[kind];
  const range = sectionRange(text, heading);
  if (!range) return { ok: false, error: `no ${heading} section` };
  const lines = text.slice(range.start, range.end).split('\n');
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    const parsed = parseLine(kind, lines[i]);
    if (!parsed) continue;
    const rank = score(parsed, needle);
    if (rank > 0) hits.push({ i, parsed, rank });
  }
  const best = hits.reduce((max, hit) => Math.max(max, hit.rank), 0);
  const chosen = hits.filter((hit) => hit.rank === best);
  if (chosen.length === 0) return { ok: false, error: `no ${kind} matches "${match}"` };
  if (chosen.length > 1) return { ok: false, error: `"${match}" matches ${chosen.length} ${kind} lines; use a longer match` };
  const hit = chosen[0];
  if (hit.parsed.keys.length > 1) {
    return { ok: false, error: `that line has more than one Linear key (${hit.parsed.keys.join(', ')})` };
  }
  const previous = lines[hit.i];
  const line = previous.replace(/\[([ xX])\]/, done ? '[x]' : '[ ]');
  lines[hit.i] = line;
  return {
    ok: true,
    text: text.slice(0, range.start) + lines.join('\n') + text.slice(range.end),
    line,
    key: hit.parsed.keys[0] || null,
    changed: line !== previous,
  };
}

export function canCreate({ kind, severity, createFollowUp = false }) {
  if (kind === 'follow-up') {
    return {
      ok: true,
      recordOnly: !createFollowUp,
      parent: false,
      label: null,
      priority: 'medium',
      state: 'backlog',
    };
  }
  if (kind !== 'bug' && kind !== 'review') return { ok: false, error: 'kind must be bug, review, or follow-up' };
  const level = String(severity || '').toLowerCase();
  if (level === 'minor') return { ok: false, error: 'minor findings stay in the spec; no Linear issue' };
  if (level !== 'blocker' && level !== 'major') return { ok: false, error: 'severity must be blocker or major' };
  return {
    ok: true,
    recordOnly: false,
    parent: true,
    label: kind === 'bug' ? 'Bug' : 'Code Review',
    priority: level === 'blocker' ? 'urgent' : 'high',
    state: 'started',
    severity: level,
  };
}

/** Where a keyed durable issue goes. The feature issue is not a target. */
export function durableTarget(kind, action) {
  if (kind === 'task' && action === 'done') return 'review';
  if (kind === 'task' && action === 'open') return 'started';
  if (kind === 'bug' && action === 'done') return 'done';
  if (kind === 'bug' && action === 'open') return 'started';
  return null;
}

export function shouldMoveKey(key, featureKey) {
  if (!key) return false;
  if (featureKey && key.toUpperCase() === String(featureKey).toUpperCase()) return false;
  return true;
}

export function linearTitle(kind, title) {
  const clean = title.trim();
  if (kind === 'bug' && !/^bug:/i.test(clean)) return `Bug: ${clean}`;
  if (kind === 'review' && !/^review:/i.test(clean)) return `Review: ${clean}`;
  return clean;
}

export function bugLine({ key, title, severity }) {
  if (!title || !severity) throw new Error('bug line needs a title and severity');
  return `- [ ] ${key ? `${key} ` : ''}${title} (${severity})`;
}

export function fixLine({ owner, key, title }) {
  if (!owner || !title) throw new Error('fix line needs an owner and title');
  return key ? `- [ ] [${owner}] Fix ${key}: ${title}` : `- [ ] [${owner}] Fix: ${title}`;
}

export function followUpLine(title, body) {
  if (!body) return `- ${title}`;
  const rest = body.trim().split('\n').map((line) => `  ${line}`).join('\n');
  return `- ${title}\n${rest}`;
}

export function deferredNote({ label, title, severity, parent, priority, body }) {
  const lines = [
    `- **${label}** — ${title} (${severity})`,
    `  - parent: ${parent || 'none'}`,
    `  - priority: ${priority}`,
    '  - create when the Linear limit allows',
  ];
  if (body) lines.push(`  - body: ${body.trim().replace(/\n/g, ' ')}`);
  return lines.join('\n');
}

export function appendBlock(text, kind, block) {
  const heading = HEADINGS[kind];
  if (!heading) throw new Error(`unknown section ${kind}`);
  const trimmed = String(block).replace(/\s+$/, '');
  if (!trimmed) throw new Error('empty block');
  const doc = withSection(text, heading);
  const range = sectionRange(doc, heading);
  const original = doc.slice(range.start, range.end);
  if (original.includes(trimmed)) return doc;
  const body = original.replace(/^\s*- \[[ xX]\][ \t]*(?:…|\.\.\.)[ \t]*\n?/gm, '');
  const prefix = body.replace(/\s*$/, '');
  const nextBody = `${prefix}${prefix.length ? '\n' : ''}${trimmed}\n`;
  return doc.slice(0, range.start) + nextBody + doc.slice(range.end);
}

function replaceExactLine(text, kind, from, to) {
  const heading = HEADINGS[kind];
  const doc = withSection(text, heading);
  const range = sectionRange(doc, heading);
  const lines = doc.slice(range.start, range.end).split('\n');
  const index = lines.findIndex((line) => line.trim() === from.trim());
  if (index === -1) return null;
  lines[index] = to;
  return doc.slice(0, range.start) + lines.join('\n') + doc.slice(range.end);
}

export function upsertBug(text, item) {
  const line = bugLine(item);
  if (item.key) {
    const replaced = replaceExactLine(text, 'bug', bugLine({ title: item.title, severity: item.severity }), line);
    if (replaced) return replaced;
  }
  return appendBlock(text, 'bug', line);
}

export function upsertFix(text, item) {
  const line = fixLine(item);
  if (item.key) {
    const replaced = replaceExactLine(text, 'task', fixLine({ owner: item.owner, title: item.title }), line);
    if (replaced) return replaced;
  }
  return appendBlock(text, 'task', line);
}

export function recordFollowUp(text, title, body) {
  return appendBlock(text, 'follow-up', followUpLine(title, body));
}

export function recordCreated(text, { kind, key, title, severity, owner, body }) {
  if (kind === 'follow-up') return recordFollowUp(text, `${key} ${title}`, body);
  let next = upsertBug(text, { key, title, severity });
  if (owner) next = upsertFix(next, { owner, key, title });
  return next;
}

export function recordRejected(text, entry) {
  const note = deferredNote({
    label: entry.label,
    title: entry.linearTitle || entry.title,
    severity: entry.severity,
    parent: entry.parent,
    priority: entry.priority,
    body: entry.body,
  });
  if (entry.kind === 'follow-up') return appendBlock(recordFollowUp(text, entry.title, entry.body), 'deferred', note);
  let next = upsertBug(text, { title: entry.title, severity: entry.severity });
  if (entry.owner) next = upsertFix(next, { owner: entry.owner, title: entry.title });
  return appendBlock(next, 'deferred', note);
}
