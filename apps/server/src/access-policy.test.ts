// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest';
import {
  anonymous,
  canSeeProduct,
  canSelfSubscribe,
  affectedSubscriptions,
  requiresConfirmation,
  type Viewer,
} from './access-policy.js';
const member: Viewer = {
  userId: 'user',
  admin: false,
  teamIds: ['team'],
  assignedProductIds: ['assigned'],
};
describe('shared product policy', () => {
  it.each([
    ['open', true, true],
    ['hidden', false, true],
    ['internal', false, true],
    ['manual', false, false],
  ])('%s visibility', (visibility, signedOut, signedIn) => {
    const product = { id: 'product', visibility };
    expect(canSeeProduct(anonymous, product, ['team'])).toBe(signedOut);
    expect(canSeeProduct(member, product, ['team'])).toBe(signedIn);
    expect(canSeeProduct({ ...member, admin: true }, product)).toBe(true);
  });
  it('Internal requires a named team; Manual requires an active admin assignment loaded by teamViewer', () => {
    expect(
      canSeeProduct(member, { id: 'product', visibility: 'internal' }, [
        'outsider',
      ]),
    ).toBe(false);
    expect(
      canSeeProduct(member, { id: 'assigned', visibility: 'manual' }),
    ).toBe(true);
    expect(canSelfSubscribe({ visibility: 'manual' })).toBe(false);
    expect(canSelfSubscribe({ visibility: 'internal' })).toBe(true);
  });
  it('only active self-service subscriptions outside the named teams are affected', () => {
    const rows = [
      { teamId: 'a', status: 'active', origin: 'self' },
      { teamId: 'b', status: 'active', origin: 'request' },
      { teamId: 'a', status: 'active', origin: 'admin' },
      { teamId: 'a', status: 'revoked', origin: 'self' },
      { teamId: 'a', status: 'revoke-pending', origin: 'self' },
    ];
    expect(affectedSubscriptions(rows, ['b'])).toEqual([rows[0]]);
    expect(requiresConfirmation(affectedSubscriptions(rows))).toBe(true);
    expect(requiresConfirmation([])).toBe(false);
  });
});
