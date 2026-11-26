// SPDX-License-Identifier: Apache-2.0
import { AdminPageEditor } from '../../../../components/admin-pages';
export default async function Page({ params }: { params: Promise<{ pageId: string }> }) { return <AdminPageEditor pageId={(await params).pageId} />; }
