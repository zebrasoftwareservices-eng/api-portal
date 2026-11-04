// SPDX-License-Identifier: Apache-2.0
import { AppDetail } from '../../../../components/app-detail';
export const metadata = { title: 'Your app' };
export default async function Page({
  params,
}: {
  params: Promise<{ appId: string }>;
}) {
  return <AppDetail appId={(await params).appId} />;
}
