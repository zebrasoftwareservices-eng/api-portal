// SPDX-License-Identifier: Apache-2.0
'use client';
import { useEffect, useRef, useState } from 'react';
import type { components } from '@portal/sdk';
import {
  AlertDialog,
  Button,
  Card,
  Input,
  PageHeader,
  toast,
} from '@portal/ui';
import { quietApi, networkProblem } from '../lib/client';
import type { Problem } from '../lib/types';
import { usePortal } from './providers';
import { useResource } from './use-resource';
import { Field, focusInvalid } from './field';
import { emailValid, SecretReplacementField } from './account-shared';
import { ProblemAlert } from './problem-alert';
type Request = components['schemas']['SaveMailSettingsRequest'];
const defaults: Request = {
  host: '',
  port: 587,
  security: 'starttls',
  username: '',
  senderName: '',
  senderAddress: '',
};
export function MailSettings() {
  const resource = useResource(() => quietApi.GET('/v1/admin/settings/mail'));
  const { user } = usePortal();
  const [form, setForm] = useState<Request>(defaults);
  const [secret, setSecret] = useState<string | null | undefined>();
  const [secretKey, setSecretKey] = useState(0);
  const [pending, setPending] = useState('');
  const [problem, setProblem] = useState<Problem>();
  const [testProblem, setTestProblem] = useState<Problem>();
  const [removeProblem, setRemoveProblem] = useState<Problem>();
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState(user?.email || '');
  const [testResult, setTestResult] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const lock = useRef(false);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const saved = resource.data?.saved;
    setForm(
      saved
        ? {
            host: saved.host,
            port: saved.port,
            security: saved.security,
            username: saved.username,
            senderName: saved.senderName,
            senderAddress: saved.senderAddress,
          }
        : defaults,
    );
    setSecret(undefined);
    setSecretKey((n) => n + 1);
    setTestResult('');
    setTestProblem(undefined);
  }, [resource.data]);
  function change(key: keyof Request, value: string | number) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setTestResult('');
  }
  const settings = resource.data;
  const baseline = settings?.saved
    ? {
        host: settings.saved.host,
        port: settings.saved.port,
        security: settings.saved.security,
        username: settings.saved.username,
        senderName: settings.saved.senderName,
        senderAddress: settings.saved.senderAddress,
      }
    : defaults;
  const dirty =
    JSON.stringify(form) !== JSON.stringify(baseline) || secret !== undefined;
  return (
    <div className="stack form">
      <PageHeader
        title="Mail"
        description="How the portal sends verification and password reset emails."
      />
      {resource.loading ? (
        <div role="status" className="stack">
          <span className="sr-only">Loading mail settings…</span>
          <Card className="skeleton settings-skeleton" />
          <Card className="skeleton settings-skeleton" />
        </div>
      ) : resource.error ? (
        <ProblemAlert
          problem={resource.error}
          message="We couldn't load the mail settings."
          onRetry={resource.reload}
        />
      ) : (
        settings && (
          <>
            <div
              className={`alert stack ${settings.source === 'none' ? 'warning' : settings.source === 'saved' ? 'success' : ''}`}
            >
              {settings.source === 'none' ? (
                <>
                  <strong>⚠ Portal email is off</strong>
                  <p>
                    Nobody gets verification or password reset emails. Save SMTP
                    settings below to turn it on.
                  </p>
                </>
              ) : settings.source === 'saved' ? (
                <>
                  <strong>✓ Portal email uses the settings saved here.</strong>
                  {settings.updatedAt && (
                    <p>
                      Last saved{' '}
                      <time
                        dateTime={settings.updatedAt}
                        title={settings.updatedAt}
                      >
                        {new Date(settings.updatedAt).toLocaleString()}
                      </time>
                      .
                    </p>
                  )}
                  {settings.environment && (
                    <p>
                      The server's environment settings are ignored while these
                      are saved.
                    </p>
                  )}
                </>
              ) : (
                <>
                  <strong>
                    ⓘ Portal email uses the server's environment settings
                  </strong>
                  <p>
                    These come from the SMTP_* variables. Save settings below to
                    use them instead.
                  </p>
                  {settings.environment && (
                    <dl>
                      {Object.entries({
                        Host: settings.environment.host,
                        Port: settings.environment.port,
                        Security: settings.environment.security.toUpperCase(),
                        Username: settings.environment.username || 'Not set',
                        Password: settings.environment.hasPassword
                          ? 'Set'
                          : 'Not set',
                        Sender: `${settings.environment.senderName} <${settings.environment.senderAddress}>`,
                      }).map(([key, value]) => (
                        <div key={key}>
                          <dt>{key}</dt>
                          <dd>
                            <code>{value}</code>
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </>
              )}
            </div>
            <Card className="stack">
              <h2>SMTP settings</h2>
              {problem && <ProblemAlert problem={problem} />}
              <form
                noValidate
                className="stack"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const submittedForm = e.currentTarget;
                  if (lock.current) return;
                  const invalid: Record<string, string> = {};
                  if (!form.host.trim())
                    invalid.host = "Enter the SMTP server's host name.";
                  if (
                    !Number.isInteger(form.port) ||
                    form.port < 1 ||
                    form.port > 65535
                  )
                    invalid.port = 'Enter a port from 1 to 65535.';
                  if ((form.username?.length || 0) > 254)
                    invalid.username = 'Use 254 characters or fewer.';
                  if ((secret?.length || 0) > 1024)
                    invalid.password = 'Use 1024 characters or fewer.';
                  if (!form.senderName.trim())
                    invalid.senderName = 'Enter the name emails come from.';
                  if (!emailValid(form.senderAddress))
                    invalid.senderAddress =
                      'Enter an email address, like portal@example.com.';
                  setErrors(invalid);
                  if (Object.keys(invalid).length) {
                    focusInvalid(submittedForm);
                    return;
                  }
                  lock.current = true;
                  setPending('save');
                  setProblem(undefined);
                  try {
                    const { data, error } = await quietApi.PUT(
                      '/v1/admin/settings/mail',
                      {
                        body: {
                          ...form,
                          host: form.host.trim(),
                          senderName: form.senderName.trim(),
                          ...(secret !== undefined ? { password: secret } : {}),
                        },
                      },
                    );
                    if (error) {
                      setProblem(error);
                      if (error.errors) {
                        setErrors(
                          Object.fromEntries(
                            error.errors.map((item) => [
                              item.pointer?.split('/').pop() || '',
                              item.message,
                            ]),
                          ),
                        );
                        focusInvalid(submittedForm);
                      }
                    } else if (data) {
                      resource.setData(data);
                      setSecret(undefined);
                      toast.success('Mail settings saved.');
                    }
                  } catch {
                    setProblem(networkProblem());
                  } finally {
                    lock.current = false;
                    setPending('');
                  }
                }}
              >
                <fieldset className="stack" disabled={!!pending}>
                  {(['host', 'port'] as const).map((key) => (
                    <Field
                      key={key}
                      label={key === 'host' ? 'Host' : 'Port'}
                      error={errors[key]}
                    >
                      {(props) => (
                        <Input
                          {...props}
                          autoComplete="off"
                          spellCheck={false}
                          type={key === 'port' ? 'number' : 'text'}
                          inputMode={key === 'port' ? 'numeric' : undefined}
                          value={Number.isNaN(form[key]) ? '' : form[key]}
                          onChange={(e) =>
                            change(
                              key,
                              key === 'port'
                                ? e.target.value === ''
                                  ? NaN
                                  : Number(e.target.value)
                                : e.target.value,
                            )
                          }
                        />
                      )}
                    </Field>
                  ))}
                  <fieldset>
                    <legend>Security</legend>
                    {(
                      [
                        ['starttls', 'STARTTLS — usually port 587'],
                        ['tls', 'TLS — usually port 465'],
                        ['none', 'None — only for a local test server'],
                      ] as const
                    ).map(([value, label]) => (
                      <label key={value} className="row">
                        <input
                          type="radio"
                          name="security"
                          checked={form.security === value}
                          onChange={() => change('security', value)}
                        />
                        {label}
                      </label>
                    ))}
                  </fieldset>
                  <Field label="Username (optional)" error={errors.username}>
                    {(props) => (
                      <Input
                        {...props}
                        autoComplete="off"
                        value={form.username || ''}
                        onChange={(e) => change('username', e.target.value)}
                      />
                    )}
                  </Field>
                  <SecretReplacementField
                    key={secretKey}
                    hasSecret={!!settings.saved?.hasPassword}
                    onChange={(value) => {
                      setSecret(value);
                    }}
                  />
                  {errors.password && (
                    <p className="field-error">{errors.password}</p>
                  )}
                  {(['senderName', 'senderAddress'] as const).map((key) => (
                    <Field
                      key={key}
                      label={
                        key === 'senderName' ? 'Sender name' : 'Sender address'
                      }
                      error={errors[key]}
                    >
                      {(props) => (
                        <Input
                          {...props}
                          type={key === 'senderAddress' ? 'email' : 'text'}
                          value={form[key]}
                          onChange={(e) => change(key, e.target.value)}
                        />
                      )}
                    </Field>
                  ))}
                  <Button>
                    {pending === 'save' ? 'Saving…' : 'Save mail settings'}
                  </Button>
                </fieldset>
              </form>
            </Card>
            <Card className="stack">
              <h2>Send a test email</h2>
              <p id="test-hint">
                {dirty
                  ? 'Save your changes first. The test uses the settings in use now.'
                  : 'Sends with the settings in use now. Save your changes first.'}
              </p>
              <form
                className="stack"
                noValidate
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (dirty || lock.current) return;
                  if (!emailValid(to)) {
                    setErrors((p) => ({
                      ...p,
                      to: 'Enter an email address, like name@example.com.',
                    }));
                    focusInvalid(e.currentTarget);
                    return;
                  }
                  lock.current = true;
                  setPending('test');
                  setTestResult('');
                  setTestProblem(undefined);
                  try {
                    const { error } = await quietApi.POST(
                      '/v1/admin/settings/mail/test',
                      { body: { to } },
                    );
                    if (error) setTestProblem(error);
                    else
                      setTestResult(
                        `Test email sent to ${to} using the ${settings.source} settings. Check that inbox.`,
                      );
                  } catch {
                    setTestProblem(networkProblem());
                  } finally {
                    lock.current = false;
                    setPending('');
                  }
                }}
              >
                <Field label="Send to" error={errors.to}>
                  {(props) => (
                    <Input
                      {...props}
                      type="email"
                      autoComplete="email"
                      readOnly={!!pending}
                      value={to}
                      onChange={(e) => setTo(e.target.value)}
                    />
                  )}
                </Field>
                <Button
                  disabled={!!pending}
                  aria-disabled={dirty}
                  aria-describedby="test-hint"
                >
                  {pending === 'test' ? 'Sending…' : 'Send test email'}
                </Button>
              </form>
              {pending === 'test' && (
                <p role="status">This can take up to 15 seconds.</p>
              )}
              {testResult && <p role="status">✓ {testResult}</p>}
              {testProblem && <ProblemAlert problem={testProblem} />}
            </Card>
            {settings.source === 'saved' && (
              <AlertDialog.Root
                open={open}
                onOpenChange={(value) => {
                  if (!pending) setOpen(value);
                }}
              >
                <AlertDialog.Trigger asChild>
                  <Button variant="link">Remove saved settings</Button>
                </AlertDialog.Trigger>
                <AlertDialog.Portal>
                  <AlertDialog.Overlay className="overlay" />
                  <AlertDialog.Content
                    className="dialog stack"
                    onOpenAutoFocus={(e) => {
                      e.preventDefault();
                      cancel.current?.focus();
                    }}
                    onEscapeKeyDown={(e) => {
                      if (pending) e.preventDefault();
                    }}
                  >
                    <AlertDialog.Title>
                      Remove the saved mail settings?
                    </AlertDialog.Title>
                    <AlertDialog.Description>
                      {settings.environment
                        ? `The portal goes back to the server's environment settings (${settings.environment.host}).`
                        : 'Portal email will be off. Nobody will get verification or password reset emails.'}
                    </AlertDialog.Description>
                    {removeProblem && (
                      <>
                        <ProblemAlert problem={removeProblem} />
                        <a href="/admin/settings/accounts">
                          Go to account settings
                        </a>
                      </>
                    )}
                    <div className="row">
                      <AlertDialog.Cancel asChild>
                        <Button
                          ref={cancel}
                          disabled={!!pending}
                          variant="secondary"
                        >
                          Cancel
                        </Button>
                      </AlertDialog.Cancel>
                      <Button
                        variant="destructive"
                        disabled={!!pending}
                        onClick={async () => {
                          if (lock.current) return;
                          lock.current = true;
                          setPending('remove');
                          setRemoveProblem(undefined);
                          try {
                            const { data, error } = await quietApi.DELETE(
                              '/v1/admin/settings/mail',
                            );
                            if (error) setRemoveProblem(error);
                            else if (data) {
                              resource.setData(data);
                              setOpen(false);
                              toast.success('Saved mail settings removed.');
                            }
                          } catch {
                            setRemoveProblem(networkProblem());
                          } finally {
                            lock.current = false;
                            setPending('');
                          }
                        }}
                      >
                        {pending === 'remove' ? 'Removing…' : 'Remove settings'}
                      </Button>
                    </div>
                  </AlertDialog.Content>
                </AlertDialog.Portal>
              </AlertDialog.Root>
            )}
          </>
        )
      )}
    </div>
  );
}
