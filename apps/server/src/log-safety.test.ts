// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { redactSecrets } from './log-safety.js';

describe('redactSecrets', () => {
  it('copies type, message, stack and cause and redacts portal keys', () => {
    const cause = new Error('nested pk_zzzzzzzzzzzzzzzz');
    const error = new TypeError('failed pk_secretadmintokenvalue');
    error.cause = cause;
    expect(redactSecrets(error)).toMatchObject({
      type: 'TypeError',
      message: 'failed pk_[redacted]',
      cause: { type: 'Error', message: 'nested pk_[redacted]' },
    });
    expect(JSON.stringify(redactSecrets(error))).not.toMatch(
      /pk_[A-Za-z0-9_-]{8,}/,
    );
  });

  it('stops at a plain value and at cause depth 5', () => {
    expect(redactSecrets('pk_abcdefghijklmnopqrst')).toEqual({
      type: 'string',
      message: 'pk_[redacted]',
    });
    let error: Error | undefined;
    for (let depth = 0; depth < 7; depth++) {
      const next = new Error(`pk_level${depth}abcdefgh`);
      next.cause = error;
      error = next;
    }
    const redacted = redactSecrets(error);
    let current: { message?: string; cause?: unknown } | undefined = redacted;
    let seen = 0;
    while (current) {
      seen += 1;
      current = current.cause as { message?: string; cause?: unknown } | undefined;
    }
    expect(seen).toBe(6);
    expect(JSON.stringify(redacted)).not.toContain('pk_level0');
  });
});
