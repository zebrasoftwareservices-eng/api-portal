// SPDX-License-Identifier: Apache-2.0
'use client';
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { Button } from '@portal/ui';
import {
  accessAction,
  checkAccess,
  recoverySentence,
  type Access,
} from '../lib/access';
import { usePortal } from './providers';

const AccessContext = createContext<{
  access: Access;
  slug: string;
  retrying: boolean;
  announcement: string;
  retry: () => void;
  actionRef: RefObject<HTMLAnchorElement | null>;
} | null>(null);
function useAccess() {
  const value = useContext(AccessContext);
  if (!value) throw new Error('Access components require ApiAccessProvider');
  return value;
}
export function ApiAccessProvider({
  slug,
  signedIn,
  children,
}: {
  slug: string;
  signedIn: boolean;
  children: ReactNode;
}) {
  const [access, setAccess] = useState<Access>({
    kind: signedIn ? 'checking' : 'signed-out',
  });
  const [retrying, setRetrying] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [attempt, setAttempt] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);
  const actionRef = useRef<HTMLAnchorElement>(null);
  const retryLock = useRef(false);
  const focusAction = useRef(false);
  useEffect(() => {
    setAnnouncement('');
    if (!signedIn) {
      setAccess({ kind: 'signed-out' });
      setRetrying(false);
      retryLock.current = false;
      return;
    }
    const retry = retryLock.current;
    if (!retry) setAccess({ kind: 'checking' });
    const controller = new AbortController();
    controllerRef.current = controller;
    // Resolve on abort even if a transport ignores its signal or stalls reading the body.
    const aborted = new Promise<Access>((resolve) => {
      controller.signal.addEventListener(
        'abort',
        () => resolve({ kind: 'failed' }),
        { once: true },
      );
    });
    const timeout = setTimeout(() => controller.abort(), 10_000);
    void Promise.race([checkAccess(slug, controller.signal), aborted]).then(
      (result) => {
        if (controllerRef.current !== controller) return;
        clearTimeout(timeout);
        setAccess(result);
        setRetrying(false);
        retryLock.current = false;
        if (retry && accessAction(result, slug)) focusAction.current = true;
        else if (retry)
          setAnnouncement("We still couldn't confirm your access.");
        else if (accessAction(result, slug))
          setAnnouncement(
            'Access checked. Your next step is at the top of the page.',
          );
      },
    );
    return () => {
      controllerRef.current = null;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [signedIn, slug, attempt]);
  useEffect(() => {
    if (focusAction.current) {
      focusAction.current = false;
      actionRef.current?.focus();
    }
  }, [access]);
  return (
    <AccessContext.Provider
      value={{
        access,
        slug,
        retrying,
        announcement,
        actionRef,
        retry: () => {
          if (retryLock.current || access.kind !== 'failed') return;
          retryLock.current = true;
          setRetrying(true);
          setAttempt((value) => value + 1);
        },
      }}
    >
      {children}
    </AccessContext.Provider>
  );
}
export function ApiAccessAction() {
  const { user } = usePortal();
  const { access, slug, actionRef } = useAccess();
  if (user?.role === 'admin')
    return <p className="muted admin-developer-note">Portal admins can&apos;t subscribe. Use a developer account to get a key.</p>;
  const action = accessAction(access, slug);
  return (
    <div className="actions access-actions">
      {action ? (
        <a ref={actionRef} className="button access-action" href={action.href}>
          {action.label}
        </a>
      ) : access.kind === 'checking' ? (
        <div className="access-placeholder" aria-hidden="true" />
      ) : null}
    </div>
  );
}
export function ApiAccessStatus() {
  const { access, retrying, retry, announcement } = useAccess();
  return (
    <div
      role="status"
      className={
        access.kind === 'failed'
          ? 'alert warning stack access-status'
          : 'sr-only'
      }
    >
      {access.kind === 'failed' && (
        <>
          <p>
            <span aria-hidden="true">⚠ </span>Access status couldn&apos;t be
            confirmed
          </p>
          <p>
            You can still read the reference and send requests with a key you
            have.
          </p>
          <div className="actions">
            <Button
              variant="secondary"
              onClick={retry}
              aria-disabled={retrying}
              aria-busy={retrying}
            >
              {retrying ? 'Checking…' : 'Try again'}
            </Button>
          </div>
        </>
      )}
      {announcement && <span className="sr-only">{announcement}</span>}
    </div>
  );
}
export function TryItRecovery() {
  return <>{recoverySentence(useAccess().access)}</>;
}
