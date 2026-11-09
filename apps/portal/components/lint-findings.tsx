// SPDX-License-Identifier: Apache-2.0
'use client';
import { useRef, useState } from 'react';
import { Button, Textarea } from '@portal/ui';
import type { components } from '@portal/sdk';
import type { Problem } from '../lib/types';
import { Field } from './field';
import { ProblemAlert } from './problem-alert';
type Finding = {
  rule?: string;
  message: string;
  pointer?: string;
  line?: number;
  column?: number;
  source?: string | null;
};
export const invalidVersionMessage =
  "The document's info.version is missing or can't be used in a URL. Use up to 64 letters, digits, dots, hyphens, underscores or plus signs, starting with a letter or digit — for example 2.0.0.";
export function LintFindings({
  findings,
  total,
  severity,
}: {
  findings: Finding[];
  total?: number;
  severity: 'error' | 'warning';
}) {
  const [all, setAll] = useState(false);
  const list = useRef<HTMLOListElement>(null);
  return (
    <>
      <ol ref={list}>
        {(all ? findings : findings.slice(0, 10)).map((f, i) => (
          <li tabIndex={-1} className="finding" key={i}>
            <strong>
              ⚠ {severity === 'error' ? 'Error' : 'Warning'}{' '}
              <code>{f.rule}</code>
            </strong>
            {f.line && (
              <span>
                {' '}
                · Line {f.line}
                {f.column ? `, column ${f.column}` : ''}
              </span>
            )}
            <p>{f.message}</p>
            {f.pointer && <code>{f.pointer}</code>}
            {f.source && (
              <p>
                In <code>{f.source}</code>
              </p>
            )}
          </li>
        ))}
      </ol>
      {!all && findings.length > 10 && (
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setAll(true);
            requestAnimationFrame(() =>
              list.current?.children[10]?.scrollIntoView?.(),
            );
            requestAnimationFrame(() =>
              (list.current?.children[10] as HTMLElement)?.focus(),
            );
          }}
        >
          Show all {findings.length}
        </Button>
      )}
      {total && total > findings.length ? (
        <p>
          Showing the first {findings.length} of {total} errors. Fix these and
          import again to see the rest.
        </p>
      ) : null}
    </>
  );
}
export function LintWarnings({
  findings = [],
  id,
}: {
  findings?: components['schemas']['LintFinding'][];
  id?: string;
}) {
  if (!findings.length) return null;
  return (
    <details className="alert warning" id={id}>
      <summary>
        ⚠ {findings.length} lint{' '}
        {findings.length === 1 ? 'warning' : 'warnings'}. The document was
        published; fix {findings.length === 1 ? 'it' : 'these'} when you can.
      </summary>
      <LintFindings findings={findings} severity="warning" />
      {findings.length === 200 && <p>Showing the first 200 warnings.</p>}
    </details>
  );
}
export function RulesetBanner({
  lint,
}: {
  lint?: { status: string; error?: string; path?: string };
}) {
  return lint?.status === 'error' ? (
    <div className="alert error stack">
      <strong>Imports are paused: the lint ruleset didn&apos;t load</strong>
      <code>
        {lint.path} {lint.error}
      </code>
      <p>
        Fix the file set in PORTAL_LINT_RULESET, then restart the server. Until
        then, nothing can be imported or published as a new version.
      </p>
    </div>
  ) : null;
}
export function ImportProblem({
  problem,
  versionForm = false,
}: {
  problem: Problem;
  versionForm?: boolean;
}) {
  const lint = problem.type.endsWith('openapi-lint-failed');
  const unavailable = problem.type.endsWith('lint-ruleset-unavailable');
  const n = problem.errorCount || problem.errors?.length || 0;
  return (
    <ProblemAlert
      problem={problem}
      title={
        lint
          ? `${n} ${n === 1 ? 'error stops' : 'errors stop'} this document from being published`
          : unavailable
            ? "Imports are paused: the lint ruleset didn't load"
            : undefined
      }
      message={
        lint ? (
          <>
            <LintFindings
              findings={problem.errors || []}
              total={problem.errorCount}
              severity="error"
            />
            <p>
              Fix these in the document and {versionForm ? 'publish' : 'import'}{' '}
              it again. Nothing was published.
            </p>
          </>
        ) : unavailable ? (
          <>
            <p>{problem.detail}</p>
            <p>
              Fix the file set in PORTAL_LINT_RULESET, then restart the server.
              Nothing was published.
            </p>
          </>
        ) : undefined
      }
    />
  );
}
export function ReleaseNote({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field
      label="Release note (optional)"
      hint="Plain text shown in the API's changelog. Up to 5,000 characters."
      error={
        value.length > 5000
          ? `Shorten the release note to 5,000 characters or fewer. It's ${value.length.toLocaleString()} now.`
          : undefined
      }
    >
      {(props) => (
        <>
          <Textarea
            rows={Math.min(12, Math.max(4, value.split('\n').length))}
            {...props}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-describedby={`${props.id}-hint ${props.id}-counter${value.length > 5000 ? ` ${props.id}-error` : ''}`}
          />
          <span
            className="hint"
            id={`${props.id}-counter`}
            aria-live={value.length >= 4800 ? 'polite' : undefined}
          >
            {value.length.toLocaleString()} / 5,000
          </span>
        </>
      )}
    </Field>
  );
}
