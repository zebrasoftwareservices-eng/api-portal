// SPDX-License-Identifier: Apache-2.0
'use client';
import { useId, useState, useEffect, type ReactNode } from 'react';
import { AlertDialog, Button, Dialog, Textarea } from '@portal/ui';
import type { components } from '@portal/sdk';
import { api } from '../lib/client';
import type { Problem } from '../lib/types';
export type AccessRequest = components['schemas']['AccessRequest'];
export type AdminTeam = Pick<
  components['schemas']['AdminTeam'],
  'id' | 'name' | 'personal'
> & { ownerEmail?: string | null };
export function AccessStatus({ status }: { status: string }) {
  const labels: Record<string, string> = {
    pending: 'Pending',
    approved: 'Approved',
    rejected: 'Rejected',
    active: 'Active',
    'revoke-pending': 'Revoke pending',
    revoked: 'Revoked',
  };
  return (
    <span className={`badge access-status access-${status}`}>
      <span aria-hidden="true">
        {
          (
            {
              pending: '◷',
              approved: '✓',
              rejected: '✕',
              active: '✓',
              'revoke-pending': '◌',
              revoked: '⊘',
            } as Record<string, string>
          )[status]
        }
      </span>{' '}
      {labels[status] || status}
    </span>
  );
}
export function VisibilityBadge({ visibility }: { visibility: string }) {
  return visibility && visibility !== 'open' ? (
    <span className="badge">
      <span aria-hidden="true">{visibility === 'hidden' ? '◉' : '♙'}</span>{' '}
      {visibility[0]!.toUpperCase() + visibility.slice(1)}
    </span>
  ) : null;
}
export function CountedTextarea({
  label,
  value,
  onChange,
  hint,
  error,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  error?: string;
  required?: boolean;
}) {
  const id = useId();
  const count = value.trim().length;
  return (
    <div className="stack">
      <label htmlFor={id}>{label}</label>
      <Textarea
        id={id}
        rows={4}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error || count > 1000}
        aria-describedby={`${id}-hint ${id}-count${error ? ` ${id}-error` : ''}`}
      />
      <span id={`${id}-hint`} className="hint">
        {hint}
      </span>
      <span
        id={`${id}-count`}
        className={count > 1000 ? 'field-error' : 'muted'}
      >
        {count}/1000{count > 1000 ? ' — too long' : ''}
      </span>
      <span className="sr-only" aria-live="polite">
        {count >= 1000 || count === 900 ? `${count} of 1000 characters` : ''}
      </span>
      {error && (
        <p id={`${id}-error`} className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}
export function AccessDialog({
  title,
  description,
  open,
  onClose,
  children,
  pending = false,
}: {
  title: string;
  description: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  pending?: boolean;
}) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(v) => {
        if (!v && !pending) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        <Dialog.Content
          className="dialog stack access-dialog"
          onEscapeKeyDown={(e) => {
            if (pending) e.preventDefault();
          }}
          onPointerDownOutside={(e) => {
            if (pending) e.preventDefault();
          }}
        >
          <Dialog.Title>{title}</Dialog.Title>
          <Dialog.Description>{description}</Dialog.Description>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Confirmation({
  problem,
  pending,
  onCancel,
  onSave,
  planName,
  error,
}: {
  error?: Problem;
  problem?: Problem;
  pending: boolean;
  onCancel: () => void;
  onSave: (choice: 'keep' | 'revoke') => void;
  planName?: string;
}) {
  const [choice, setChoice] = useState<'keep' | 'revoke'>('keep');
  const count = problem?.affectedTeams || 0;
  useEffect(() => {
    if (problem) setChoice('keep');
  }, [problem]);
  return (
    <AlertDialog.Root
      open={!!problem}
      onOpenChange={(open) => {
        if (!open && !pending) onCancel();
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="overlay" />
        <AlertDialog.Content
          className="dialog stack"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            document.getElementById('keep-existing-keys')?.focus();
          }}
        >
          <AlertDialog.Title>
            {count === 1
              ? '1 team has an active subscription'
              : `${count} teams have active subscriptions`}
          </AlertDialog.Title>
          <AlertDialog.Description>
            {planName
              ? `These teams subscribed before ${planName} required approval.`
              : 'They no longer meet the new access setting. What should happen to their existing keys?'}
            {(problem?.affectedSubscriptions || 0) > count &&
              ` (${problem?.affectedSubscriptions} subscriptions)`}
          </AlertDialog.Description>
          <fieldset disabled={pending} className="stack">
            <legend className="sr-only">Existing keys</legend>
            <label>
              <input
                id="keep-existing-keys"
                type="radio"
                name="existing-keys"
                checked={choice === 'keep'}
                onChange={() => setChoice('keep')}
              />{' '}
              Keep them working
              <span className="hint">
                Their keys keep working. New teams can&apos;t subscribe.
              </span>
            </label>
            <label>
              <input
                type="radio"
                name="existing-keys"
                checked={choice === 'revoke'}
                onChange={() => setChoice('revoke')}
              />{' '}
              Revoke them
              <span className="hint">
                Delete their keys from the gateway now. We email each
                team&apos;s Admins and Members.
              </span>
            </label>
          </fieldset>
          <div role="alert">{error && (error.detail || error.title)}</div>
          <div className="actions">
            <Button variant="secondary" disabled={pending} onClick={onCancel}>
              Cancel
            </Button>
            <Button
              disabled={pending}
              variant={choice === 'revoke' ? 'destructive' : 'default'}
              onClick={() => onSave(choice)}
            >
              {pending
                ? 'Saving…'
                : choice === 'keep'
                  ? 'Save and keep keys'
                  : 'Save and revoke keys'}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
export const teamLabel = (t: AdminTeam) =>
  t.personal && t.ownerEmail ? `Personal: ${t.ownerEmail}` : t.name;
export function TeamCombobox({
  value,
  onChange,
  multiple = false,
}: {
  value: AdminTeam[];
  onChange: (teams: AdminTeam[]) => void;
  multiple?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [q, setQ] = useState('');
  const [items, setItems] = useState<AdminTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const id = useId();
  useEffect(() => {
    let active = true;
    setLoading(true);
    const timer = setTimeout(() => {
      void api
        .GET('/v1/admin/teams', { params: { query: { q, limit: 20 } } })
        .then((r) => {
          if (active) {
            setItems(r.data?.items || []);
            setFailed(!!r.error);
            setLoading(false);
          }
        })
        .catch(() => {
          if (active) {
            setFailed(true);
            setLoading(false);
          }
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [q, retry]);
  function choose(t: AdminTeam) {
    onChange(
      multiple
        ? value.some((v) => v.id === t.id)
          ? value.filter((v) => v.id !== t.id)
          : [...value, t]
        : [t],
    );
    if (!multiple) setExpanded(false);
  }
  return (
    <div className="stack">
      <label htmlFor={id}>Search teams…</label>
      <input
        id={id}
        value={q}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-activedescendant={
          expanded && items[activeIndex]
            ? `${id}-option-${activeIndex}`
            : undefined
        }
        onFocus={() => setExpanded(true)}
        onChange={(e) => {
          setQ(e.target.value);
          setExpanded(true);
          setActiveIndex(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            setExpanded(true);
            setActiveIndex((n) =>
              items.length
                ? (n + (e.key === 'ArrowDown' ? 1 : items.length - 1)) %
                  items.length
                : 0,
            );
          } else if (e.key === 'Enter' && expanded && items[activeIndex]) {
            e.preventDefault();
            choose(items[activeIndex]);
          } else if (e.key === 'Escape' && expanded) {
            e.preventDefault();
            e.stopPropagation();
            setExpanded(false);
          }
        }}
        aria-controls={`${id}-listbox`}
      />
      <div
        id={`${id}-results`}
        className="team-search-results"
        hidden={!expanded}
        aria-label="Matching teams"
      >
        {loading ? (
          <p role="status">Searching…</p>
        ) : failed ? (
          <p role="alert">
            Couldn&apos;t load teams.{' '}
            <Button
              type="button"
              variant="ghost"
              onClick={() => setRetry((n) => n + 1)}
            >
              Try again
            </Button>
          </p>
        ) : !items.length ? (
          <p>No teams match &quot;{q}&quot;</p>
        ) : (
          <div
            role="listbox"
            id={`${id}-listbox`}
            aria-label="Matching teams"
            aria-multiselectable={multiple}
          >
            {items.map((t, index) => (
              <button
                type="button"
                role="option"
                id={`${id}-option-${index}`}
                key={t.id}
                aria-selected={value.some((v) => v.id === t.id)}
                onClick={() => choose(t)}
              >
                {teamLabel(t)}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="row">
        {value.map((t) => (
          <span className="badge" key={t.id}>
            {teamLabel(t)}{' '}
            <Button
              type="button"
              variant="ghost"
              aria-label={`Remove ${teamLabel(t)}`}
              onClick={() => onChange(value.filter((v) => v.id !== t.id))}
            >
              ×
            </Button>
          </span>
        ))}
      </div>
    </div>
  );
}
