// SPDX-License-Identifier: Apache-2.0
import type { components } from '@portal/sdk';
export function ChangeList({
  changes,
  version,
  headingLevel = 3,
}: {
  changes: components['schemas']['ChangeSummary'];
  version: string;
  headingLevel?: 3 | 4;
}) {
  const Heading = headingLevel === 3 ? 'h3' : 'h4';
  return (
    <div className="stack">
      <p>
        Compared with <code>{changes.comparedTo}</code>.
      </p>
      {changes.breaking && (
        <p className="alert error">
          ⚠ Breaking changes. Calls that work on {changes.comparedTo} may fail
          on {version}.
        </p>
      )}
      {(['added', 'removed', 'changed'] as const).map((group) =>
        changes[group].length ? (
          <section key={group}>
            <Heading>
              {group[0]!.toUpperCase() + group.slice(1)} (
              {changes[group].length})
            </Heading>
            <ul>
              {changes[group].map((op) => (
                <li key={`${op.method} ${op.path}`}>
                  <div className="row">
                    <span className="badge mono">{op.method}</span>
                    <code>{op.path}</code>
                    {op.summary && <span className="muted">{op.summary}</span>}
                    {op.breaking && (
                      <span className="badge breaking">⚠ Breaking</span>
                    )}
                  </div>
                  {group === 'changed' && (
                    <ul>
                      {op.reasons.map((r, i) => (
                        <li key={i}>
                          {op.breaking && (
                            <>
                              <span className="sr-only">Breaking: </span>
                              <span aria-hidden="true">⚠ </span>
                            </>
                          )}
                          {r.message
                            .split(/(`[^`]+`)/g)
                            .map((text, j) =>
                              text.startsWith('`') && text.endsWith('`') ? (
                                <code key={j}>{text.slice(1, -1)}</code>
                              ) : (
                                text
                              ),
                            )}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ) : null,
      )}
      {!changes.added.length &&
        !changes.removed.length &&
        !changes.changed.length && (
          <p>No operations were added, removed or changed.</p>
        )}
    </div>
  );
}
