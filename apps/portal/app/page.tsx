// SPDX-License-Identifier: Apache-2.0
import { serverClient, currentUser } from '../lib/server';
import { isDemo } from '../lib/demo';
import { demoData } from '../lib/demo-data';
import { CatalogView } from '../components/catalog-view';
export const metadata = { title: 'APIs' };
export default async function Catalog() {
  if (isDemo())
    return <CatalogView items={[demoData().api]} user={null} demo />;
  const client = await serverClient();
  const [{ data, error }, user] = await Promise.all([
    client.GET('/v1/apis'),
    currentUser(),
  ]);
  if (error) throw new Error('Catalog unavailable');
  return <CatalogView items={data?.items || []} user={user} />;
}
