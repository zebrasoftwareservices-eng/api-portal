// SPDX-License-Identifier: Apache-2.0
import { serverClient } from '../../../../lib/server';
import { ProductForm } from '../../../../components/admin-products';
export const metadata = { title: 'Create product · Admin' };
export default async function Page() {
  const { data } = await (await serverClient()).GET('/v1/apis');
  if (!data) throw new Error('Catalog unavailable');
  return <ProductForm apis={data.items} />;
}
