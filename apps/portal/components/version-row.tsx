// SPDX-License-Identifier: Apache-2.0
import { Button, VersionSwitcher } from '@portal/ui';
import type { ApiDetail } from '../lib/types';
import { versionHref } from '../lib/version-links';
export function VersionRow({
  api,
  current = api.version,
  markdownUrl,
  downloadUrl,
}: {
  api: Pick<ApiDetail, 'slug' | 'version'> & {
    versions: Omit<
      ApiDetail['versions'][number],
      'markdownUrl' | 'downloadUrl'
    >[];
  };
  current?: string;
  markdownUrl?: string;
  downloadUrl?: string;
}) {
  return (
    <div
      className={`version-row${markdownUrl && downloadUrl ? ' agent-docs-row' : ''}`}
    >
      <VersionSwitcher
        current={current}
        versions={(api.versions || []).map((v) => ({
          ...v,
          href: versionHref(api.slug, v.version, v.isLatest),
        }))}
        changelogHref={`/apis/${api.slug}/changelog`}
      />
      <span className="version-reading-links">
        <a href={`/apis/${api.slug}/changelog`}>Changelog</a>
        {markdownUrl && (
          <>
            <span className="version-link-separator" aria-hidden="true">
              ·
            </span>
            <a href={markdownUrl}>
              View as Markdown{' '}
              <span className="sr-only">(version {current})</span>
            </a>
          </>
        )}
      </span>
      {downloadUrl && (
        <Button asChild variant="secondary" className="version-download">
          <a href={downloadUrl} download>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <path d="m7 10 5 5 5-5M12 15V3" />
            </svg>
            Download spec <span className="sr-only">(version {current})</span>
          </a>
        </Button>
      )}
    </div>
  );
}
