// SPDX-License-Identifier: Apache-2.0
import type { components } from '@portal/sdk';
import { api, networkProblem } from './client';
import type { Problem } from './types';

export type TracingSettings = components['schemas']['TracingSettingsInput'];
export type TracingSelection = components['schemas']['TracingSelection'] & {
  slug?: string | null;
};
export type TracingState = components['schemas']['Tracing'];
export type TraceSpan = components['schemas']['TraceSpan'];
export type Trace = components['schemas']['Trace'];
export type TestResult = components['schemas']['TracingTestResult'];
export type Target = {
  id: string;
  name: string;
  slug?: string;
  email?: string;
};
type Raw<T> = { data?: T; error?: unknown; response: Response };
type TracingClient = {
  GET(path: '/v1/admin/tracing'): Promise<Raw<TracingState>>;
  GET(path: '/v1/admin/tracing/latest'): Promise<Raw<{ trace: Trace | null }>>;
  GET(
    path: '/v1/apis',
  ): Promise<Raw<{ items: Array<{ id: string; slug: string; title: string }> }>>;
  GET(path: '/v1/admin/teams'): Promise<Raw<{ items: Target[] }>>;
  GET(
    path: '/v1/admin/tracing/developers',
    init: { params: { query: { q: string } } },
  ): Promise<Raw<{ items: Target[] }>>;
  PUT(
    path: '/v1/admin/tracing',
    init: { body: TracingSettings },
  ): Promise<Raw<TracingState>>;
  POST(
    path: '/v1/admin/tracing/test',
    init: { body: TracingSettings },
  ): Promise<Raw<TestResult>>;
  POST(
    path: '/v1/admin/tracing/selections',
    init: { body: { kind: string; targetId: string } },
  ): Promise<Raw<TracingSelection>>;
  DELETE(
    path: '/v1/admin/tracing/selections/{selectionId}',
    init: { params: { path: { selectionId: string } } },
  ): Promise<Raw<void>>;
};
const client = api as unknown as TracingClient;

async function settle<T>(run: () => Promise<Raw<T>>) {
  try {
    const result = await run();
    return {
      data: result.data,
      error: result.error
        ? ({
            ...(result.error as object),
            status: result.response.status,
          } as Problem)
        : undefined,
      response: result.response,
    };
  } catch {
    return { error: networkProblem(), response: undefined };
  }
}

export const tracingApi = {
  get: () => settle(() => client.GET('/v1/admin/tracing')),
  latest: () => settle(() => client.GET('/v1/admin/tracing/latest')),
  save: (body: TracingSettings) =>
    settle(() => client.PUT('/v1/admin/tracing', { body })),
  test: (body: TracingSettings) =>
    settle(() => client.POST('/v1/admin/tracing/test', { body })),
  add: (kind: TracingSelection['kind'], targetId: string) =>
    settle(() =>
      client.POST('/v1/admin/tracing/selections', { body: { kind, targetId } }),
    ),
  remove: (id: string) =>
    settle(() =>
      client.DELETE('/v1/admin/tracing/selections/{selectionId}', {
        params: { path: { selectionId: id } },
      }),
    ),
  targets: async (kind: TracingSelection['kind'], q = '') => {
    if (kind === 'developer')
      return settle(() =>
        client.GET('/v1/admin/tracing/developers', {
          params: { query: { q } },
        }),
      );
    if (kind === 'api') {
      const result = await settle(() => client.GET('/v1/apis'));
      return {
        ...result,
        data: result.data
          ? {
              items: result.data.items.map(({ id, slug, title }) => ({
                id,
                slug,
                name: title,
              })),
            }
          : undefined,
      };
    }
    return settle(() => client.GET('/v1/admin/teams'));
  },
};
