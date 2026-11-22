// SPDX-License-Identifier: Apache-2.0
import type { components } from '@portal/sdk';
import { api, networkProblem } from './client';
import type { Problem } from './types';

export type TryItTrace = components['schemas']['TryItTrace'];

export async function getTryItTrace(traceId: string) {
  try {
    const result = await api.GET('/v1/try-it/traces/{traceId}', {
      params: { path: { traceId } },
    });
    return {
      data: result.data,
      error: result.error
        ? ({
            ...(result.error as object),
            status: result.response.status,
          } as Problem)
        : undefined,
    };
  } catch {
    return { error: networkProblem() };
  }
}
