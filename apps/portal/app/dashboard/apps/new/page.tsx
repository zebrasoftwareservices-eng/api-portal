// SPDX-License-Identifier: Apache-2.0
import { CreateApp } from '../../../../components/create-app';
export const metadata = { title: 'Create an app' };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ api?: string }>;
}) {
  return <CreateApp slug={(await searchParams).api} />;
}
