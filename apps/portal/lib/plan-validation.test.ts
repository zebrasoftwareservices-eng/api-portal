// SPDX-License-Identifier: Apache-2.0
import { expect, it } from 'vitest';
import { validatePlan, type PlanFields } from './plan-validation';
const valid: PlanFields = {
  name: 'Free',
  description: '',
  rateLimit: '5',
  rateLimitUnit: 'second',
  monthlyQuota: '10000',
  apiIds: ['orders'],
};
it('collects every failing field instead of stopping at the first invalid number', () => {
  expect(
    validatePlan({
      name: '',
      description: 'x'.repeat(281),
      rateLimit: '2.5',
      rateLimitUnit: 'hour',
      monthlyQuota: '0',
      apiIds: [],
    }),
  ).toEqual({
    name: 'Enter a plan name.',
    description: 'Use 280 characters or fewer.',
    rateLimit: 'Enter a whole number, such as 5.',
    rateLimitUnit: 'Choose per second or per minute.',
    monthlyQuota: 'Enter a monthly quota of 1 or more.',
    apiIds: 'Choose at least one API.',
  });
});
it.each(['', '0', '-1', '2.5', 'abc', '1000001'])(
  'rejects rate limit %s',
  (value) => {
    expect(validatePlan({ ...valid, rateLimit: value }).rateLimit).toBeTruthy();
  },
);
it.each(['', '0', '-1', '2.5', 'abc', '2000000001'])(
  'rejects monthly quota %s',
  (value) => {
    expect(
      validatePlan({ ...valid, monthlyQuota: value }).monthlyQuota,
    ).toBeTruthy();
  },
);
it('requires quota at least equal to rate and accepts boundary limits', () => {
  expect(validatePlan({ ...valid, monthlyQuota: '4' }).monthlyQuota).toBe(
    'Make the monthly quota at least the rate limit (5).',
  );
  expect(
    validatePlan({
      ...valid,
      rateLimit: '1000000',
      monthlyQuota: '2000000000',
    }),
  ).toEqual({});
});
