// SPDX-License-Identifier: Apache-2.0
import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';
afterEach(cleanup);
// The root suite runs browser component tests alongside real gateway containers.
configure({ asyncUtilTimeout: 5000 });

// Node 25+ exposes its own web storage globals; use Vitest's actual jsdom realm.
declare const jsdom: { window: Window } | undefined;
if (typeof jsdom !== 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: jsdom.window.localStorage,
  });
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: jsdom.window.sessionStorage,
  });
}
