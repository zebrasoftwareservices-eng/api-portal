// SPDX-License-Identifier: Apache-2.0

type ResponseHook = (payload: { response: Response }) => void;
type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type FetchTarget = typeof globalThis;

const patchFlag = Symbol.for('portal.tryItTraceFetch');

type FetchPatch = typeof fetch & { [patchFlag]?: PatchState };

type PatchState = {
  listeners: Set<ResponseHook>;
  restore: () => void;
};

/**
 * Scalar 0.8's Try it client calls the page `fetch`. `configuration.fetch` only
 * loads the OpenAPI document, and the reference does not pass API-client plugins
 * into the modal. This bridge keeps the `onResponseReceived` hook and runs it
 * for `/api/v1/try-it` responses from that page fetch.
 */
export function createScalarResponseBridge(
  onResponseReceived: ResponseHook,
  fetcher: Fetcher = globalThis.fetch,
) {
  const plugin = () => ({
    name: 'portal-try-it-trace',
    hooks: {
      onResponseReceived: ({ response }: { response: Response }) =>
        onResponseReceived({ response }),
    },
  });
  return {
    plugin,
    fetch: async (input: string | URL | Request, init?: RequestInit) => {
      const response = await fetcher(input, init);
      if (!isFetchPatch(fetcher) && isTryItProxyExchange(input, response)) {
        await plugin().hooks.onResponseReceived({ response });
      }
      return response;
    },
    install() {
      const state = installFetchPatch();
      state.listeners.add(onResponseReceived);
      return () => {
        state.listeners.delete(onResponseReceived);
        if (state.listeners.size === 0) state.restore();
      };
    },
  };
}

export function isTryItProxyExchange(
  input: string | URL | Request,
  response: Response,
) {
  if (!isTryItProxyUrl(requestUrl(input))) return false;
  return response.headers.has('X-Portal-Trace-State');
}

function requestUrl(input: string | URL | Request) {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function isTryItProxyUrl(raw: string) {
  try {
    const path = new URL(raw, 'http://portal.local').pathname.replace(/\/+$/, '');
    return path === '/api/v1/try-it';
  } catch {
    return false;
  }
}

function isFetchPatch(fetcher: Fetcher): fetcher is FetchPatch {
  return patchFlag in fetcher;
}

function fetchTargets(): FetchTarget[] {
  if (typeof window === 'undefined' || window === globalThis) return [globalThis];
  return [globalThis, window];
}

function installFetchPatch(): PatchState {
  const current = globalThis.fetch as FetchPatch;
  if (current?.[patchFlag]) return current[patchFlag];
  const originals = fetchTargets().map((target) => ({
    target,
    fetch: target.fetch,
  }));
  const listeners = new Set<ResponseHook>();
  const callOriginal = originals[0]?.fetch ?? globalThis.fetch;
  const patched = (async (input: string | URL | Request, init?: RequestInit) => {
    const response = await callOriginal(input, init);
    if (isTryItProxyExchange(input, response)) {
      await Promise.all(
        [...listeners].map((listener) =>
          Promise.resolve()
            .then(() => listener({ response }))
            .catch(() => undefined),
        ),
      );
    }
    return response;
  }) as FetchPatch;
  const state: PatchState = {
    listeners,
    restore() {
      if ((globalThis.fetch as FetchPatch)?.[patchFlag] !== state) return;
      for (const item of originals) item.target.fetch = item.fetch;
    },
  };
  patched[patchFlag] = state;
  for (const item of originals) item.target.fetch = patched;
  return state;
}
