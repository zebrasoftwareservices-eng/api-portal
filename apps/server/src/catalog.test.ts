// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { publicDocument, type PublishedApi } from './catalog.js';

const row = {
  gateway: { proxyPublicUrl: 'https://gateway.example/' },
  api: { routePath: '/pets' },
} as PublishedApi;
const schemes = {
  bearer: { type: 'http', scheme: 'bearer' },
  firstKey: { type: 'apiKey', in: 'header', name: 'apikey' },
  secondKey: { type: 'apiKey', in: 'query', name: 'key' },
};

describe('public OpenAPI security', () => {
  it('JSO-175: applies the first apiKey at root with operation-only security', () => {
    const input = {
      components: { securitySchemes: schemes },
      paths: {
        '/pets': { get: { security: [{ secondKey: [] }] }, post: {} },
        '/public': { get: { security: [] } },
      },
    };
    const result = publicDocument(row, input);
    expect(result.security).toEqual([{ firstKey: [] }]);
    expect(result.paths).toEqual(input.paths);
    expect(result.components).toEqual(input.components);
    expect(result.servers).toEqual([{ url: 'https://gateway.example/pets' }]);
    expect(input).not.toHaveProperty('security');
    expect(input).not.toHaveProperty('servers');
  });

  it.each([{ security: [{ bearer: [] }] }, { security: [] }])(
    'JSO-175: preserves explicit root security $security',
    ({ security }) => {
      const input = {
        components: { securitySchemes: schemes },
        security,
      };
      expect(publicDocument(row, input).security).toEqual(security);
    },
  );

  it('retains the portal key fallback for documents without an apiKey scheme', () => {
    const result = publicDocument(row, {
      components: { securitySchemes: { bearer: schemes.bearer } },
    });
    expect(result.security).toEqual([{ portalApiKey: [] }]);
    expect(result.components).toMatchObject({
      securitySchemes: {
        bearer: schemes.bearer,
        portalApiKey: { type: 'apiKey', in: 'header', name: 'apikey' },
      },
    });
  });
});
