// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ManagedPage } from '../../../components/managed-page';
import { pageForPreview, previewMetadata } from '../../../lib/pages-server';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ pageId: string }>;
}): Promise<Metadata> {
  const { data, status } = await pageForPreview((await params).pageId);
  return previewMetadata(status, data);
}

export default async function Preview({ params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  const { data, status } = await pageForPreview(pageId);
  if (status !== 200 || !data) notFound();
  return (
    <div className="stack">
      <div className="alert warning preview-banner">
        <span>
          {data.status === 'published' ? (
            <>
              Preview. This page is published at <code>/pages/{data.slug}</code>.
            </>
          ) : (
            'Preview. Only admins can see this draft.'
          )}
        </span>
        <a href={`/admin/pages/${pageId}`}>Back to editor</a>
      </div>
      <ManagedPage page={data} preview />
    </div>
  );
}
