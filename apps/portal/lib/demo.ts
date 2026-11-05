// SPDX-License-Identifier: Apache-2.0
export function isDemo(): boolean {
  return process.env.PORTAL_DEMO_ACTIVE === 'true';
}
export const QUICKSTART_COMMAND =
  'docker compose -f deploy/docker-compose.yml up --build';
export const QUICKSTART_URL =
  'https://github.com/zebrasoftwareservices-eng/api-portal#quickstart';
