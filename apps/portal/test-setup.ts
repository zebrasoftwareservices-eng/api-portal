// SPDX-License-Identifier: Apache-2.0
import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';
afterEach(cleanup);
// The root suite runs browser component tests alongside real gateway containers.
configure({ asyncUtilTimeout: 5000 });
