// SPDX-License-Identifier: Apache-2.0
'use client';
import { useEffect, useRef, useState } from 'react';
import type { components } from '@portal/sdk';
import { Button, Card, Input, PageHeader, Switch, toast } from '@portal/ui';
import { quietApi, networkProblem } from '../lib/client';
import type { Problem } from '../lib/types';
import { useResource } from './use-resource';
import { ProblemAlert } from './problem-alert';
import { focusInvalid } from './field';
type Settings = components['schemas']['AccountSettings'];
const limits = [
  [
    'signInFailures',
    'Failed sign-ins',
    'Failed sign-ins, per email address',
    'attempts',
  ],
  [
    'passwordResetEmails',
    'Password reset emails',
    'Password reset emails, per email address',
    'emails',
  ],
  [
    'verificationEmails',
    'Verification emails',
    'Verification emails, per account',
    'emails',
  ],
] as const;
export function AccountSettings() {
  const resource = useResource(() =>
    quietApi.GET('/v1/admin/settings/accounts'),
  );
  const [settings, setSettings] = useState<Settings>();
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<Problem>();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const lock = useRef(false);
  useEffect(() => {
    if (resource.data) setSettings(resource.data);
  }, [resource.data]);
  return (
    <div className="stack form">
      <PageHeader
        title="Accounts"
        description="Email verification and limits that protect sign-in and inboxes."
      />
      {resource.loading ? (
        <div role="status" className="stack">
          <span className="sr-only">Loading account settings…</span>
          <Card className="skeleton settings-skeleton" />
          <Card className="skeleton settings-skeleton" />
        </div>
      ) : resource.error ? (
        <ProblemAlert
          problem={resource.error}
          message="We couldn't load the account settings."
          onRetry={resource.reload}
        />
      ) : (
        settings && (
          <form
            noValidate
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              if (lock.current) return;
              const invalid: Record<string, string> = {};
              for (const [key] of limits) {
                const limit = settings.rateLimits[key];
                if (
                  !Number.isInteger(limit.max) ||
                  limit.max < 1 ||
                  limit.max > 1000
                )
                  invalid[`${key}-max`] = 'Enter a number from 1 to 1000.';
                if (
                  !Number.isInteger(limit.windowMinutes) ||
                  limit.windowMinutes < 1 ||
                  limit.windowMinutes > 1440
                )
                  invalid[`${key}-windowMinutes`] =
                    'Enter minutes from 1 to 1440 (24 hours).';
              }
              setErrors(invalid);
              if (Object.keys(invalid).length) {
                focusInvalid(e.currentTarget);
                return;
              }
              lock.current = true;
              setPending(true);
              setProblem(undefined);
              try {
                const { data, error } = await quietApi.PUT(
                  '/v1/admin/settings/accounts',
                  {
                    body: {
                      requireVerifiedEmail: settings.requireVerifiedEmail,
                      rateLimits: settings.rateLimits,
                    },
                  },
                );
                if (error) {
                  const inline = Object.fromEntries(
                    (error.errors || []).flatMap((item) => {
                      const match = item.pointer?.match(/^\/rateLimits\/([^/]+)\/(max|windowMinutes)$/);
                      return match ? [[`${match[1]}-${match[2]}`, item.message]] : [];
                    }),
                  );
                  if (Object.keys(inline).length) {
                    setErrors(inline);
                    requestAnimationFrame(() => focusInvalid(form));
                  } else setProblem(error);
                  if (error.status === 409)
                    setSettings({
                      ...settings,
                      requireVerifiedEmail: false,
                      mailConfigured: false,
                    });
                } else if (data) {
                  setSettings(data);
                  toast.success('Account settings saved.');
                }
              } catch {
                setProblem(networkProblem());
              } finally {
                lock.current = false;
                setPending(false);
              }
            }}
          >
            <Card className="stack">
              <h2>Email verification</h2>
              <label htmlFor="require-verified">
                <Switch
                  id="require-verified"
                  aria-describedby={
                    settings.mailConfigured
                      ? 'verification-hint'
                      : 'verification-hint mail-warning'
                  }
                  checked={settings.requireVerifiedEmail}
                  disabled={
                    pending ||
                    (!settings.mailConfigured && !settings.requireVerifiedEmail)
                  }
                  onCheckedChange={(checked) =>
                    setSettings({
                      ...settings,
                      requireVerifiedEmail: checked,
                    })
                  }
                />{' '}
                Require a verified email
              </label>
              <p id="verification-hint">
                Developers who haven't verified their address can't create apps
                or keys until they do. Keys they already have keep working.
                Accounts from before this setting existed count as verified.
              </p>
              {!settings.mailConfigured && (
                <p id="mail-warning" className="alert warning">
                  ⚠ Set up mail first. Without it, nobody can get a verification
                  email. <a href="/admin/settings/mail">Go to mail settings</a>
                </p>
              )}
            </Card>
            <Card className="stack">
              <h2>Rate limits</h2>
              <p>Over a limit, people wait before trying again.</p>
              {limits.map(([key, label, legend, unit]) => (
                <fieldset key={key} disabled={pending} className="stack">
                  <legend>{legend}</legend>
                  <div className="limit-row">
                    {(['max', 'windowMinutes'] as const).map((field, i) => (
                      <span className="limit-field" key={field}>
                        {i === 1 && <span aria-hidden="true">in</span>}
                        <label className="sr-only" htmlFor={`${key}-${field}`}>
                          {label}:{' '}
                          {i === 0
                            ? unit === 'attempts'
                              ? 'maximum attempts'
                              : 'maximum emails'
                            : 'window in minutes'}
                        </label>
                        <Input
                          id={`${key}-${field}`}
                          type="text"
                          inputMode="numeric"
                          aria-invalid={!!errors[`${key}-${field}`]}
                          aria-describedby={
                            errors[`${key}-${field}`]
                              ? `${key}-${field}-error`
                              : undefined
                          }
                          value={
                            Number.isNaN(settings.rateLimits[key][field])
                              ? ''
                              : settings.rateLimits[key][field]
                          }
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              rateLimits: {
                                ...settings.rateLimits,
                                [key]: {
                                  ...settings.rateLimits[key],
                                  [field]:
                                    e.target.value === ''
                                      ? NaN
                                      : Number(e.target.value),
                                },
                              },
                            })
                          }
                        />{' '}
                        <span aria-hidden="true">{i === 0 ? unit : 'minutes'}</span>
                        {errors[`${key}-${field}`] && (
                          <span id={`${key}-${field}-error`} className="field-error limit-error">
                            <span aria-hidden="true">⚠ </span>{errors[`${key}-${field}`]}
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                </fieldset>
              ))}
              <p className="hint">
                Counts resends and email changes, not the email sent at sign-up.
              </p>
            </Card>
            {problem && (
              <>
                <ProblemAlert problem={problem} />
                {problem.status === 409 && (
                  <a href="/admin/settings/mail">Go to mail settings</a>
                )}
              </>
            )}
            <Button className="account-save" disabled={pending}>
              {pending ? 'Saving…' : 'Save account settings'}
            </Button>
          </form>
        )
      )}
    </div>
  );
}
