// SPDX-License-Identifier: Apache-2.0
export type PlanFields = {
  name: string;
  description: string;
  rateLimit: string;
  rateLimitUnit: string;
  monthlyQuota: string;
  apiIds: string[];
};
export function validatePlan(values: PlanFields): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!values.name.trim()) errors.name = 'Enter a plan name.';
  else if (values.name.trim().length > 40)
    errors.name = 'Use 40 characters or fewer.';
  if (values.description.length > 280)
    errors.description = 'Use 280 characters or fewer.';
  for (const [field, label, example, max] of [
    ['rateLimit', 'rate limit', '5', 1000000],
    ['monthlyQuota', 'monthly quota', '10000', 2000000000],
  ] as const) {
    const raw = values[field].trim();
    const n = Number(raw);
    if (!raw) errors[field] = `Enter a ${label}.`;
    else if (!Number.isInteger(n))
      errors[field] = `Enter a whole number, such as ${example}.`;
    else if (n <= 0) errors[field] = `Enter a ${label} of 1 or more.`;
    else if (n > max)
      errors[field] = `Enter ${max.toLocaleString('en')} or less.`;
  }
  if (
    !errors.monthlyQuota &&
    !errors.rateLimit &&
    Number(values.monthlyQuota) < Number(values.rateLimit)
  )
    errors.monthlyQuota = `Make the monthly quota at least the rate limit (${values.rateLimit}).`;
  if (!['second', 'minute'].includes(values.rateLimitUnit))
    errors.rateLimitUnit = 'Choose per second or per minute.';
  if (!values.apiIds.length) errors.apiIds = 'Choose at least one API.';
  else if (values.apiIds.length > 50)
    errors.apiIds = 'Choose 50 APIs or fewer.';
  return errors;
}
