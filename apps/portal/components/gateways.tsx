// SPDX-License-Identifier: Apache-2.0
'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertDialog,
  Badge,
  Button,
  Card,
  PageHeader,
  toast,
} from '@portal/ui';
import { api, networkProblem, retrySeconds } from '../lib/client';
import type { Gateway, Health, Problem } from '../lib/types';
import { useResource } from './use-resource';
import { ProblemAlert } from './problem-alert';
import { GatewayForm, KONG_ADMIN_DOCS } from './gateway-form';
import { DateValue } from './date';
export function GatewayStatusBadge({
  enabled,
  health,
  loading,
}: {
  enabled: boolean;
  health: Health['gateway'] | undefined;
  loading: boolean;
}) {
  if (!enabled) return <Badge>○ Disabled</Badge>;
  if (loading) return <span role="status">Loading connection status…</span>;
  if (!health) return <Badge>● Enabled</Badge>;
  return (
    <>
      <Badge className={health.reachable ? 'active' : 'warning'}>
        {health.reachable ? '● Connected' : '⚠ Not responding'}
      </Badge>
      {health.reachable && health.version && <span>Kong {health.version}</span>}
    </>
  );
}
export function GatewayCard({
  gateway,
  onChanged,
}: {
  gateway: Gateway;
  onChanged(): void;
}) {
  const health = useResource(() => api.GET('/v1/health'));
  const [editing, setEditing] = useState(false);
  const [dialog, setDialog] = useState<'disable' | 'remove'>();
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<Problem>();
  const [retry, setRetry] = useState(0);
  const [inUse, setInUse] = useState<Problem>();
  const lastAction = useRef<'enable' | 'disable' | 'remove'>('enable');
  const lock = useRef(false);
  const actionButton = useRef<HTMLButtonElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const dialogTrigger = useRef<HTMLElement | null>(null);
  const focusAfter = useRef(false);
  useEffect(() => {
    if (focusAfter.current) {
      actionButton.current?.focus();
      focusAfter.current = false;
    }
  }, [gateway.enabled]);
  async function change(action: 'enable' | 'disable' | 'remove') {
    if (lock.current) return;
    lock.current = true;
    lastAction.current = action;
    setPending(true);
    setProblem(undefined);
    setInUse(undefined);
    try {
      const result =
        action === 'remove'
          ? await api.DELETE('/v1/admin/gateways/{gatewayId}', {
              params: { path: { gatewayId: gateway.id } },
            })
          : await api.PATCH('/v1/admin/gateways/{gatewayId}', {
              params: { path: { gatewayId: gateway.id } },
              body: { enabled: action === 'enable' },
            });
      if (result.error) {
        setRetry(retrySeconds(result.response));
        if (result.error.type.endsWith('/gateway-in-use'))
          setInUse(result.error);
        else {
          setProblem(result.error);
          setDialog(undefined);
          if (
            result.error.status === 404 ||
            result.error.type.endsWith('/gateway-env-managed')
          )
            onChanged();
        }
      } else {
        setDialog(undefined);
        focusAfter.current = true;
        toast.success(
          action === 'enable'
            ? 'Gateway enabled.'
            : action === 'disable'
              ? 'Gateway disabled.'
              : 'Gateway removed.',
        );
        onChanged();
      }
    } catch {
      setProblem(networkProblem());
      setDialog(undefined);
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  if (editing)
    return (
      <GatewayForm
        mode="edit"
        gateway={gateway}
        bundled={null}
        onReload={onChanged}
        onSaved={(g, unchanged) => {
          setEditing(false);
          if (!unchanged)
            toast.success(
              g.enabled
                ? 'Gateway connection saved.'
                : "Gateway connection saved. It's still disabled.",
            );
          onChanged();
          requestAnimationFrame(() => editButton.current?.focus());
        }}
        cancel={
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setEditing(false);
              requestAnimationFrame(() => editButton.current?.focus());
            }}
          >
            Cancel
          </Button>
        }
      />
    );
  const counts = inUse
    ? [
        inUse.apis
          ? `${inUse.apis} published API${inUse.apis === 1 ? '' : 's'}`
          : '',
        inUse.activeKeys
          ? `${inUse.activeKeys} active key${inUse.activeKeys === 1 ? '' : 's'}`
          : '',
      ]
        .filter(Boolean)
        .join(' and ')
    : '';
  return (
    <Card className="form stack">
      <div className="row">
        <h2>Kong</h2>
        <GatewayStatusBadge
          enabled={gateway.enabled}
          health={health.data?.gateway}
          loading={health.loading}
        />
        {gateway.managedBy === 'env' && <Badge>Set by environment</Badge>}
      </div>
      {!gateway.enabled ? (
        <p className="alert warning">
          ⚠ New apps, new keys and API imports are off. Existing keys keep
          working and docs stay published.
        </p>
      ) : (
        health.data?.gateway?.reachable === false && (
          <p className="alert warning">
            ⚠ Kong's Admin API isn't responding. Imports, new apps and new keys
            will fail until it's back. If the server's PORTAL_ENCRYPTION_KEY
            changed, the stored token can't be read: select Edit and enter it
            again.
          </p>
        )
      )}
      <dl className="gateway-details">
        {[
          ['Admin API URL', gateway.adminUrl],
          ['Admin API token', gateway.hasAdminToken ? 'Stored' : 'None'],
          ['Internal proxy URL', gateway.proxyInternalUrl],
          ['Public proxy URL', gateway.proxyPublicUrl],
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd className={label?.includes('URL') ? 'mono' : ''}>{value}</dd>
          </div>
        ))}
        <div>
          <dt>Last changed</dt>
          <dd>
            <DateValue value={gateway.updatedAt} />
          </dd>
        </div>
      </dl>
      {problem && (
        <>
          <ProblemAlert
            problem={problem}
            message={
              <>
                {problem.detail}
                <p>
                  {lastAction.current === 'enable'
                    ? 'The gateway stays disabled.'
                    : ''}
                </p>
              </>
            }
            onRetry={() => void change(lastAction.current)}
            retryAfterSeconds={retry}
          />
          {!gateway.enabled && (
            <Button variant="secondary" onClick={() => setEditing(true)}>
              Edit connection
            </Button>
          )}
        </>
      )}
      {gateway.managedBy === 'env' ? (
        <p className="alert">
          ⓘ KONG_ADMIN_URL set this connection, so it can't be changed here.
          Change the server's environment and restart it. To manage it here
          instead, unset KONG_ADMIN_URL and restart the server.
        </p>
      ) : (
        <div className="actions">
          {!gateway.enabled && (
            <Button
              ref={actionButton}
              disabled={pending}
              aria-busy={pending}
              onClick={() => void change('enable')}
            >
              {pending ? 'Checking Kong…' : 'Enable'}
            </Button>
          )}
          <Button
            ref={editButton}
            variant="secondary"
            disabled={pending}
            onClick={() => setEditing(true)}
          >
            Edit
          </Button>
          {gateway.enabled && (
            <Button
              ref={actionButton}
              variant="secondary"
              disabled={pending}
              onClick={(e) => {
                dialogTrigger.current = e.currentTarget;
                setInUse(undefined);
                setDialog('disable');
              }}
            >
              Disable
            </Button>
          )}
          <Button
            variant="destructive"
            disabled={pending}
            onClick={(e) => {
              dialogTrigger.current = e.currentTarget;
              setInUse(undefined);
              setDialog('remove');
            }}
          >
            Remove
          </Button>
        </div>
      )}
      <AlertDialog.Root
        open={!!dialog}
        onOpenChange={(open) => {
          if (!open && !pending) setDialog(undefined);
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="overlay" />
          <AlertDialog.Content
            className="dialog stack"
            onCloseAutoFocus={(e) => {
              e.preventDefault();
              dialogTrigger.current?.focus();
            }}
            onEscapeKeyDown={(e) => {
              if (pending) e.preventDefault();
            }}
          >
            <AlertDialog.Title>
              {dialog === 'disable'
                ? 'Disable this gateway?'
                : 'Remove this gateway?'}
            </AlertDialog.Title>
            <AlertDialog.Description asChild>
              {dialog === 'disable' ? (
                <div className="stack">
                  <p>
                    New apps, new keys and API imports stop until you enable it
                    again.
                  </p>
                  <p>
                    Existing keys keep working through Kong, and docs stay
                    published. Revoking keys and repairing Kong keep running.
                  </p>
                  <p>
                    Enabling runs the connection checks again, so Kong must be
                    answering.
                  </p>
                </div>
              ) : (
                <p>
                  This deletes the connection and its stored token. The portal's
                  objects stay in Kong, including its consumers, keys and ACLs,
                  so traffic through Kong doesn't change. To remove them, follow
                  the{' '}
                  <a href={`${KONG_ADMIN_DOCS}#cleanup-steps`}>cleanup steps</a>
                  .
                </p>
              )}
            </AlertDialog.Description>
            {inUse && (
              <div className="alert error" role="alert">
                <strong>⚠ This gateway is still in use</strong>
                <p>{counts} depend on it. Nothing was removed.</p>
                <p>
                  {inUse.apis
                    ? "The portal can't unpublish an API yet."
                    : 'Developers can revoke their keys in their dashboards.'}{' '}
                  To use a different Kong, edit this connection. To stop new
                  apps and keys, disable it.
                </p>
              </div>
            )}
            <div className="actions">
              <AlertDialog.Cancel asChild>
                <Button variant="secondary" disabled={pending}>
                  {inUse ? 'Close' : 'Cancel'}
                </Button>
              </AlertDialog.Cancel>
              {!inUse && (
                <Button
                  variant="destructive"
                  disabled={pending}
                  onClick={() => void change(dialog!)}
                >
                  {pending
                    ? dialog === 'disable'
                      ? 'Disabling…'
                      : 'Removing…'
                    : dialog === 'disable'
                      ? 'Disable gateway'
                      : 'Remove gateway'}
                </Button>
              )}
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </Card>
  );
}
export function Gateways({ setup = false }: { setup?: boolean }) {
  const router = useRouter();
  const resource = useResource(() => api.GET('/v1/admin/gateways'));
  const [saved, setSaved] = useState<Gateway>();
  const [removed, setRemoved] = useState(false);
  const [sample, setSample] = useState<{ title: string; slug: string }>();
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<Problem>();
  const [retry, setRetry] = useState(0);
  const lock = useRef(false);
  const hadGateway = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const status = useRef<HTMLDivElement>(null);
  const gateway = resource.data?.items[0];
  useEffect(() => {
    if (setup) heading.current?.focus();
  }, [setup]);
  useEffect(() => {
    if (setup && gateway && !saved) router.replace('/admin/gateways');
  }, [setup, gateway, saved, router]);
  useEffect(() => {
    if (saved || removed || sample) status.current?.focus();
  }, [saved, removed, sample]);
  useEffect(() => {
    if (gateway) hadGateway.current = true;
    else if (resource.data && hadGateway.current) {
      setRemoved(true);
      hadGateway.current = false;
    }
  }, [gateway, resource.data]);
  async function publish() {
    if (!saved || lock.current) return;
    lock.current = true;
    setPending(true);
    setProblem(undefined);
    try {
      const result = await api.POST('/v1/admin/gateways/{gatewayId}/sample', {
        params: { path: { gatewayId: saved.id } },
      });
      if (result.error) {
        setProblem(result.error);
        setRetry(retrySeconds(result.response));
      } else if (result.data) setSample(result.data);
    } catch {
      setProblem(networkProblem());
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  return (
    <div className="stack">
      {setup ? (
        <>
          <h1 ref={heading} tabIndex={-1}>
            Connect your Kong
          </h1>
          <p>
            The portal reads services from Kong and creates consumers and keys
            there. Test the connection before you save it.
          </p>
        </>
      ) : (
        <PageHeader
          title="Gateways"
          description="A portal connects to one gateway."
        />
      )}
      {removed && (
        <div ref={status} role="status" tabIndex={-1} className="alert success">
          ✓ Gateway removed. Its stored token is deleted, and the portal's
          objects stay in Kong. To remove them, follow the{' '}
          <a href={`${KONG_ADMIN_DOCS}#cleanup-steps`}>cleanup steps</a>.
        </div>
      )}
      {resource.loading && !resource.data ? (
        <p role="status">Loading gateway connection…</p>
      ) : resource.error ? (
        <ProblemAlert problem={resource.error} onRetry={resource.reload} />
      ) : setup && saved ? (
        <div className="form stack">
          <div
            className="alert success"
            role="status"
            tabIndex={-1}
            ref={status}
          >
            ✓ Kong is connected. The portal is using it now, with no restart.
          </div>
          {sample ? (
            <>
              <div
                ref={status}
                role="status"
                tabIndex={-1}
                className="alert success"
              >
                ✓ Published Sample HTTP API. It's now in the public catalog.
              </div>
              <a className="button" href={`/apis/${sample.slug}`}>
                View Sample HTTP API
              </a>
              <a href="/admin/apis">Go to Admin</a>
            </>
          ) : saved.sampleAvailable ? (
            <>
              <h2>Add the sample API?</h2>
              <p>
                It adds a sample service and route to the bundled Kong and
                publishes Sample HTTP API in the catalog, so you can try a key
                straight away. Skip it if this isn't a trial.
              </p>
              {problem && (
                <ProblemAlert
                  problem={problem}
                  title={
                    problem.type.endsWith('/gateway-disabled')
                      ? 'This gateway is disabled.'
                      : problem.type.endsWith('/sample-not-available')
                        ? "The sample isn't available here."
                        : undefined
                  }
                  message={
                    problem.type.endsWith('/gateway-disabled')
                      ? 'Enable it in Admin → Gateways to publish the sample. Nothing was published.'
                      : problem.type.endsWith('/sample-not-available')
                        ? 'The sample only works on the bundled Kong, and only if no API already uses the slug sample. Nothing was published.'
                        : problem.status === 503
                          ? "Can't reach Kong's Admin API. Nothing was published."
                          : problem.status === 502
                            ? 'Kong rejected the request. Nothing was published.'
                            : undefined
                  }
                  onRetry={publish}
                  retryAfterSeconds={retry}
                />
              )}
              <div className="actions">
                <Button
                  disabled={pending}
                  aria-busy={pending}
                  onClick={() => void publish()}
                >
                  {pending ? 'Publishing…' : 'Publish the sample API'}
                </Button>
                {!pending && <a href="/admin/apis">Continue without it</a>}
              </div>
            </>
          ) : (
            <>
              <p>Next, publish your first API.</p>
              <a className="button" href="/admin/apis">
                Import an API
              </a>
            </>
          )}
        </div>
      ) : gateway ? (
        <>
          {saved && (
            <div
              ref={status}
              role="status"
              tabIndex={-1}
              className="alert success"
            >
              ✓ Kong is connected. The portal is using it now, with no restart.{' '}
              <a href="/admin/apis">Import an API</a>
            </div>
          )}
          <GatewayCard gateway={gateway} onChanged={resource.reload} />
        </>
      ) : (
        <>
          <h2>Connect a Kong</h2>
          <GatewayForm
            mode="add"
            bundled={resource.data?.bundled || null}
            onReload={resource.reload}
            onSaved={(g) => {
              setSaved(g);
              setRemoved(false);
              void resource.reload();
            }}
            cancel={
              setup ? (
                <p>
                  <a href="/admin/apis">Skip for now.</a> You can connect a Kong
                  later in Admin → Gateways.
                </p>
              ) : undefined
            }
          />
        </>
      )}
    </div>
  );
}
