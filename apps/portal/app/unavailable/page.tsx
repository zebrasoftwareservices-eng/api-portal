// SPDX-License-Identifier: Apache-2.0
import { ServerUnavailable } from '../../components/server-unavailable';
export const metadata = { title: { absolute: 'Developer Portal' } };
export default function Unavailable() {
  return <ServerUnavailable />;
}
