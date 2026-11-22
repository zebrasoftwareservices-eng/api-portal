// SPDX-License-Identifier: Apache-2.0
'use client';

import { useEffect, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { TryItTracePanel, type TryItResponseTrace } from './try-it-trace-panel';

const mountAttribute = 'data-portal-try-it-trace';

export function ScalarTracePortal({
  rootRef,
  response,
  isAdmin,
}: {
  rootRef: RefObject<HTMLDivElement | null>;
  response?: TryItResponseTrace;
  isAdmin: boolean;
}) {
  const [mount, setMount] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !response) {
      setMount(null);
      return;
    }
    let host: HTMLElement | null = null;
    const attach = () => {
      const target = findScalarResponseContainer(root);
      if (!target) {
        if (host && !host.isConnected) host = null;
        setMount((current) => (current?.isConnected ? current : null));
        return;
      }
      const existing = target.querySelector<HTMLElement>(
        `:scope > [${mountAttribute}]`,
      );
      if (existing) host = existing;
      if (!host || host.parentElement !== target) {
        host?.remove();
        host = document.createElement('div');
        host.setAttribute(mountAttribute, '');
        host.className = 'scalar-try-it-trace-mount';
        target.append(host);
      }
      setMount((current) => (current === host ? current : host));
    };
    attach();
    const observer = new MutationObserver(attach);
    observer.observe(root, { childList: true, subtree: true });
    const frame = window.requestAnimationFrame(attach);
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
      host?.remove();
    };
  }, [response, rootRef]);

  const panel = <TryItTracePanel response={response} isAdmin={isAdmin} />;
  return mount ? createPortal(panel, mount) : <div className="try-it-trace-fallback">{panel}</div>;
}

export function findScalarResponseContainer(root: HTMLElement) {
  const containers = root.querySelectorAll<HTMLElement>(
    '.response-section-content',
  );
  return containers.item(containers.length - 1) || null;
}
