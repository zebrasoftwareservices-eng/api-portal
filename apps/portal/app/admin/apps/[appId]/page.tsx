// SPDX-License-Identifier: Apache-2.0
import { AdminAppDetail } from '../../../../components/admin-app-detail';
export default async function Page({ params }: { params: Promise<{ appId: string }> }) { return <AdminAppDetail appId={(await params).appId} />; }
