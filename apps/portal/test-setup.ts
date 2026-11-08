// SPDX-License-Identifier: Apache-2.0
import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
// jsdom does not implement layout observers used by the Radix Switch.
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);
afterEach(cleanup);
// The root suite runs browser component tests alongside real gateway containers.
configure({ asyncUtilTimeout: 5000 });
