// SPDX-License-Identifier: Apache-2.0
'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertDialog, Button, Input, toast } from '@portal/ui';
import type { components } from '@portal/sdk';
import { api, networkProblem, retrySeconds } from '../lib/client';
import type { Gateway, GatewayUrls, Problem } from '../lib/types';
import { Field, focusInvalid } from './field';
import { ProblemAlert } from './problem-alert';
export const KONG_ADMIN_DOCS =
  'https://github.com/zebrasoftwareservices-eng/api-portal/blob/main/docs/reaching-the-kong-admin-api.md';
export function normaliseGatewayUrl(value: string) {
  try {
    const url = new URL(value.trim());
    return `${url.origin}${url.pathname}`.replace(/\/$/, '');
  } catch {
    return value.trim();
  }
}
export function gatewayFieldErrors(problem: Problem): Record<string, string> {
  const code = problem.type.split('/').pop();
  const cases: Record<string, [string, string]> = {
    'gateway-unreachable': [
      'adminUrl',
      problem.detail?.includes('localhost')
        ? 'Use an address the portal server can reach.'
        : 'Check this address.',
    ],
    'gateway-token-refused': ['adminToken', 'Kong refused this token.'],
    'gateway-not-kong': ['adminUrl', "This isn't a Kong Admin API."],
    'gateway-read-only': ['adminUrl', 'This Kong is read-only.'],
    'gateway-proxy-unreachable': ['proxyInternalUrl', 'Check this address.'],
    'gateway-token-required': [
      'adminToken',
      'Enter the token for this Kong, or choose This Kong needs no token.',
    ],
  };
  const entry = cases[code || ''];
  return entry
    ? { [entry[0]]: entry[1] }
    : Object.fromEntries(
        (problem.errors || []).map((e) => [
          e.pointer?.slice(1) || '',
          e.message,
        ]),
      );
}
export function GatewayChanges({
  urlChanged = false,
}: {
  urlChanged?: boolean;
}) {
  return (
    <section className="stack">
      <h3>What saving changes in this Kong</h3>
      <p>
        The portal starts writing to this Kong as soon as you save. Test changes
        nothing.
      </p>
      <ul>
        <li>
          <strong>Consumers and keys:</strong> it creates a consumer for each
          developer app, with its keys and group memberships.
        </li>
        <li>
          <strong>Services you publish:</strong> it adds an ACL plugin, so only
          apps that include that API can call it. Other Kong consumers lose
          access until you add them to its group, and Kong stops forwarding API
          keys to the upstream.
        </li>
        <li>
          <strong>Other services with key-auth:</strong> it adds a{' '}
          <code>deny</code> ACL plugin, so portal keys get 403 there. Your own
          consumers' keys keep working.
        </li>
        <li>
          <strong>Routes with no auth plugin:</strong> it leaves them alone.
        </li>
      </ul>
      <p>
        Everything it creates carries the tag{' '}
        <code>portal-instance-&lt;id&gt;</code>, and it stays in Kong if you
        remove this connection.
      </p>
      {urlChanged && (
        <p>
          APIs already published stay linked to the services on the current
          Kong. Read{' '}
          <a href={`${KONG_ADMIN_DOCS}#changing-kong`}>
            what changing Kong does and doesn't move
          </a>
          .
        </p>
      )}
    </section>
  );
}
export function GatewayForm({
  mode,
  gateway,
  bundled,
  onSaved,
  cancel,
  onReload,
}: {
  mode: 'add' | 'edit';
  gateway?: Gateway;
  bundled: GatewayUrls | null;
  onSaved(gateway: Gateway, unchanged?: boolean): void;
  cancel?: ReactNode;
  onReload?: () => void;
}) {
  const initial = gateway || bundled;
  const [values, setValues] = useState<GatewayUrls>({
    adminUrl: initial?.adminUrl || '',
    proxyInternalUrl: initial?.proxyInternalUrl || '',
    proxyPublicUrl: initial?.proxyPublicUrl || '',
  });
  const [token, setToken] = useState('');
  const [noToken, setNoToken] = useState(false);
  const [show, setShow] = useState(false);
  const [pending, setPending] = useState<'test' | 'save'>();
  const [problem, setProblem] = useState<Problem>();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [tested, setTested] =
    useState<components['schemas']['GatewayTestResult']>();
  const [confirm, setConfirm] = useState<Problem>();
  const [retry, setRetry] = useState(0);
  const [lastAction, setLastAction] = useState<'test' | 'save'>('test');
  const lock = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  const saveButton = useRef<HTMLButtonElement>(null);
  const result = useRef<HTMLDivElement>(null);
  const editHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    editHeading.current?.focus();
  }, []);
  const changed =
    !!gateway &&
    normaliseGatewayUrl(values.adminUrl) !==
      normaliseGatewayUrl(gateway.adminUrl);
  useEffect(() => {
    if (!pending) {
      if (Object.keys(errors).length && form.current)
        focusInvalid(form.current);
      else if (tested) result.current?.focus();
    }
  }, [pending, errors, tested]);
  function clear() {
    setProblem(undefined);
    setErrors({});
    setTested(undefined);
  }
  async function run(action: 'test' | 'save', confirmed = false) {
    if (lock.current) return;
    const urls = Object.fromEntries(
      Object.entries(values).map(([key, value]) => [key, value.trim()]),
    ) as GatewayUrls;
    const invalid: Record<string, string> = {};
    for (const [key, value] of Object.entries(urls)) {
      try {
        if (!['http:', 'https:'].includes(new URL(value).protocol))
          throw new Error();
      } catch {
        invalid[key] = 'Enter a URL that starts with http:// or https://.';
      }
    }
    if (token.trim().length > 1024)
      invalid.adminToken = 'Use 1024 characters or fewer.';
    setErrors(invalid);
    if (Object.keys(invalid).length) return;
    lock.current = true;
    setPending(action);
    setLastAction(action);
    setProblem(undefined);
    setTested(undefined);
    try {
      const adminToken = noToken
        ? { adminToken: null }
        : token.trim()
          ? { adminToken: token.trim() }
          : {};
      const patch: components['schemas']['UpdateGatewayRequest'] = {
        ...adminToken,
      };
      for (const key of Object.keys(urls) as (keyof GatewayUrls)[])
        if (urls[key] !== gateway?.[key]) patch[key] = urls[key];
      if (confirmed) patch.confirmMissingKeys = true;
      if (action === 'save' && gateway && !Object.keys(patch).length) {
        toast.info('No changes to save.');
        onSaved(gateway, true);
        return;
      }
      if (action === 'test') {
        const response = await api.POST('/v1/admin/gateways/test', {
          body: {
            ...urls,
            ...adminToken,
            ...(gateway ? { gatewayId: gateway.id } : {}),
          },
        });
        if (response.error) fail(response.error, response.response);
        else setTested(response.data);
      } else {
        const response = gateway
          ? await api.PATCH('/v1/admin/gateways/{gatewayId}', {
              params: { path: { gatewayId: gateway.id } },
              body: patch,
            })
          : await api.POST('/v1/admin/gateways', {
              body: {
                ...urls,
                ...(token.trim() ? { adminToken: token.trim() } : {}),
              },
            });
        if (response.error) fail(response.error, response.response);
        else if (response.data) {
          setToken('');
          onSaved(response.data);
        }
      }
    } catch {
      setProblem(networkProblem());
    } finally {
      lock.current = false;
      setPending(undefined);
    }
  }
  function fail(error: Problem, response: Response) {
    setRetry(retrySeconds(response));
    if (error.type.endsWith('/gateway-keys-missing')) {
      setConfirm(error);
      return;
    }
    setConfirm(undefined);
    setProblem(error);
    setErrors(gatewayFieldErrors(error));
    if (
      error.status === 404 ||
      error.type.endsWith('/gateway-exists') ||
      error.type.endsWith('/gateway-env-managed')
    ) {
      if (error.status === 404)
        toast.info('This gateway connection no longer exists.');
      onReload?.();
    }
  }
  const tokenHint = noToken
    ? 'Saving removes the stored token, and the portal connects with no token.'
    : gateway?.hasAdminToken
      ? changed
        ? "You changed the Admin API URL, so the stored token won't be sent to it. Enter the token for this Kong, or choose This Kong needs no token."
        : 'A token is stored. Leave this blank to keep it, or enter a new one.'
      : 'Sent as the Kong-Admin-Token header and stored encrypted. Leave blank if the Admin API has none.';
  return (
    <>
      <form
        ref={form}
        className="form stack"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void run('save');
        }}
      >
        {mode === 'edit' && (
          <h2 tabIndex={-1} ref={editHeading}>
            Edit connection
          </h2>
        )}
        {!gateway && bundled && (
          <p className="alert">
            ⓘ These are the bundled Kong's values from your compose file. Keep
            them, or enter your own Kong's.
          </p>
        )}
        <p>
          Need a safe way to reach the Admin API? Read{' '}
          <a href={KONG_ADMIN_DOCS}>Reaching the Kong Admin API</a>.
        </p>
        <fieldset disabled={!!pending} className="stack">
          <Field
            label="Admin API URL"
            error={errors.adminUrl}
            hint="The address the portal server uses to reach Kong's Admin API, like http://kong:8001. It's resolved from the server, not your machine."
          >
            {(props) => (
              <Input
                {...props}
                className="mono"
                type="url"
                required
                spellCheck={false}
                autoCapitalize="off"
                value={values.adminUrl}
                onChange={(e) => {
                  clear();
                  setValues({ ...values, adminUrl: e.target.value });
                }}
              />
            )}
          </Field>
          <Field
            label="Admin API token (optional)"
            error={errors.adminToken}
            hint={tokenHint}
          >
            {(props) => (
              <div className="row">
                <Input
                  {...props}
                  className="mono"
                  type={show ? 'text' : 'password'}
                  autoComplete="new-password"
                  spellCheck={false}
                  disabled={noToken}
                  value={token}
                  onChange={(e) => {
                    clear();
                    setToken(e.target.value);
                  }}
                />
                <Button
                  variant="ghost"
                  type="button"
                  aria-pressed={show}
                  onClick={() => setShow(!show)}
                >
                  {show ? 'Hide' : 'Show'}
                </Button>
              </div>
            )}
          </Field>
          <span className="sr-only" aria-live="polite">
            {tokenHint}
          </span>
          {gateway?.hasAdminToken && (
            <label>
              <input
                type="checkbox"
                checked={noToken}
                onChange={(e) => {
                  clear();
                  setNoToken(e.target.checked);
                  setToken('');
                }}
              />{' '}
              This Kong needs no token
            </label>
          )}
          {(
            [
              [
                'proxyInternalUrl',
                'Internal proxy URL',
                "Where the portal server reaches Kong's proxy. Test checks this one.",
              ],
              [
                'proxyPublicUrl',
                'Public proxy URL',
                "The address developers call, shown in the catalog. The server can't check it, so make sure it's right.",
              ],
            ] as const
          ).map(([key, label, hint]) => (
            <Field key={key} label={label} hint={hint} error={errors[key]}>
              {(props) => (
                <Input
                  {...props}
                  type="url"
                  className="mono"
                  required
                  spellCheck={false}
                  value={values[key]}
                  onChange={(e) => {
                    clear();
                    setValues({ ...values, [key]: e.target.value });
                  }}
                />
              )}
            </Field>
          ))}
        </fieldset>
        <GatewayChanges urlChanged={changed} />
        {pending && (
          <p role="status">Checking Kong. This can take a few seconds.</p>
        )}
        {tested && (
          <>
            <div
              className="alert success"
              role="status"
              ref={result}
              tabIndex={-1}
              aria-describedby={
                tested.warnings.length ? 'gateway-warnings' : undefined
              }
            >
              ✓ Connected to Kong {tested.version}. The Admin API and internal
              proxy answered. Nothing has been saved yet. Check the public proxy
              URL yourself, because the server can't test it.
            </div>
            <div id="gateway-warnings">
              {tested.warnings.map((w) => (
                <p className="alert warning" key={w.code}>
                  ⚠ {w.message}
                </p>
              ))}
            </div>
          </>
        )}
        {problem && (
          <ProblemAlert
            problem={problem}
            title={
              problem.status === 429
                ? lastAction === 'test'
                  ? 'Too many tests'
                  : 'Too many attempts'
                : undefined
            }
            message={
              <>
                {problem.status === 429
                  ? 'Wait a moment and try again. Your values are still here.'
                  : problem.detail}
                {lastAction === 'save' && (
                  <p>
                    {gateway
                      ? 'Nothing was saved. The existing connection keeps working.'
                      : 'Nothing was saved.'}
                  </p>
                )}
              </>
            }
            onRetry={() => void run(lastAction)}
            retryAfterSeconds={retry}
          />
        )}
        <div className="actions">
          <Button
            ref={saveButton}
            type="submit"
            disabled={!!pending}
            aria-busy={pending === 'save'}
          >
            {pending === 'save' ? 'Checking and saving…' : 'Save connection'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={!!pending}
            aria-busy={pending === 'test'}
            onClick={() => void run('test')}
          >
            {pending === 'test' ? 'Testing…' : 'Test connection'}
          </Button>
          {!pending && cancel}
        </div>
      </form>
      <AlertDialog.Root
        open={!!confirm}
        onOpenChange={(open) => {
          if (!open && !pending) setConfirm(undefined);
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="overlay" />
          <AlertDialog.Content
            className="dialog stack"
            onEscapeKeyDown={(e) => {
              if (pending) e.preventDefault();
            }}
            onCloseAutoFocus={(e) => {
              e.preventDefault();
              saveButton.current?.focus();
            }}
          >
            <AlertDialog.Title>
              Some keys won't work on this Kong
            </AlertDialog.Title>
            <AlertDialog.Description asChild>
              <div className="stack">
                <p>
                  {confirm?.affectedKeys} active keys have no consumer on this
                  Kong, so they won't work there. The portal stores only each
                  key's last four characters, so it can't recreate them.
                  Developers will need new keys.
                </p>
                <p>
                  Those keys keep working on your current Kong until you remove
                  them there. Once you save, the portal can't reach that Kong,
                  so revoking a key here won't stop it there.
                </p>
              </div>
            </AlertDialog.Description>
            <div className="actions">
              <AlertDialog.Cancel asChild>
                <Button variant="secondary" disabled={!!pending}>
                  Keep current connection
                </Button>
              </AlertDialog.Cancel>
              <Button
                variant="destructive"
                disabled={!!pending}
                onClick={() => void run('save', true)}
              >
                {pending ? 'Saving…' : 'Save anyway'}
              </Button>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  );
}
