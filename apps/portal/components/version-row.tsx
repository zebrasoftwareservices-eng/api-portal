// SPDX-License-Identifier: Apache-2.0
import { VersionSwitcher } from '@portal/ui';
import type { ApiDetail } from '../lib/types';
import { versionHref } from '../lib/version-links';
export function VersionRow({
  api,
  current = api.version,
}: {
  api: Pick<ApiDetail, 'slug' | 'version' | 'versions'>;
  current?: string;
}) {
  return (
    <div className="version-row">
      <VersionSwitcher
        current={current}
        versions={(api.versions || []).map((v) => ({
          ...v,
          href: versionHref(api.slug, v.version, v.isLatest),
        }))}
        changelogHref={`/apis/${api.slug}/changelog`}
      />
      <a href={`/apis/${api.slug}/changelog`}>Changelog</a>
    </div>
  );
}
