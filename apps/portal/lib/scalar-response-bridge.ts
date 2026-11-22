// SPDX-License-Identifier: Apache-2.0

type ResponseHook = (payload: { response: Response }) => void;
type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

/**
 * Bridges Scalar's configurable fetch function to its API-client response hook shape.
 * ApiReferenceReact does not currently pass user API-client plugins to its modal.
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
      await plugin().hooks.onResponseReceived({ response });
      return response;
    },
  };
}
