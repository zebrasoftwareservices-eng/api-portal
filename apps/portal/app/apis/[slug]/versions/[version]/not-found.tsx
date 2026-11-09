// SPDX-License-Identifier: Apache-2.0
'use client';
import { useParams } from 'next/navigation';
import { Button, PageHeader } from '@portal/ui';
export default function NotFound() {
  const { slug, version } = useParams<{ slug: string; version: string }>();
  return (
    <div className="stack">
      <PageHeader title="Version not found" />
      <p>
        This API has no version <code>{version?.slice(0, 64)}</code>. It may
        have been mistyped, or the link is from another portal.
      </p>
      <div className="row">
        <Button asChild>
          <a href={`/apis/${slug}`}>View latest version</a>
        </Button>
        <Button asChild variant="secondary">
          <a href={`/apis/${slug}/changelog`}>View changelog</a>
        </Button>
      </div>
    </div>
  );
}
