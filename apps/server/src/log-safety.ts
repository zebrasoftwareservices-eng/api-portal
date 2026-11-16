// SPDX-License-Identifier: Apache-2.0
const SECRET = /pk_[A-Za-z0-9_-]+/g;
export type RedactedError = {
  type: string;
  message: string;
  stack?: string;
  cause?: RedactedError;
};
function redact(value: string) {
  return value.replace(SECRET, 'pk_[redacted]');
}
// Copies type, message, stack and cause. Kong error bodies can echo a key, so
// every string is redacted. Cause stops at depth 5.
export function redactSecrets(error: unknown, depth = 0): RedactedError {
  if (!(error instanceof Error))
    return {
      type: typeof error,
      message: redact(typeof error === 'string' ? error : 'Unknown error'),
    };
  const copy: RedactedError = {
    type: error.name || error.constructor.name,
    message: redact(error.message),
  };
  if (error.stack) copy.stack = redact(error.stack);
  if (depth < 5 && error.cause !== undefined)
    copy.cause = redactSecrets(error.cause, depth + 1);
  return copy;
}
