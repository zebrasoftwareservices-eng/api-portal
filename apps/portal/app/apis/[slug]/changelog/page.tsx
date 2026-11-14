// SPDX-License-Identifier: Apache-2.0
import { changelogBySlug } from '../../../../lib/changelog-server';
import { EmptyState, PageHeader } from '@portal/ui';
import { DateValue } from '../../../../components/date';
import { ChangeList } from '../../../../components/change-list';
import { PlainReleaseNote } from '../../../../components/release-note';
import { versionHref } from '../../../../lib/version-links';
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { api, entries } = await changelogBySlug(slug);
  return (
    <div className="stack">
      <PageHeader
        title={`${api.title} changelog`}
        description="Every version published in this portal, newest first."
        breadcrumb={[
          { label: 'APIs', href: '/' },
          { label: api.title, href: `/apis/${slug}` },
          { label: 'Changelog' },
        ]}
      />
      {!entries.length && (
        <EmptyState
          title="No versions yet"
          description="This API's versions will appear here when they're published."
        />
      )}
      {entries.map((entry, i) => (
        <article
          className="stack changelog-entry"
          id={`v-${entry.version}`}
          aria-labelledby={`heading-${entry.version}`}
          key={entry.version}
        >
          <div className="row">
            <h2 className="mono" id={`heading-${entry.version}`}>
              {entry.version}
            </h2>
            {entry.version === api.version && (
              <span className="badge latest">Latest</span>
            )}
            <span className="muted">
              Published <DateValue value={entry.publishedAt} />
            </span>
          </div>
          <PlainReleaseNote note={entry.releaseNote} />
          {entry.changes ? (
            <ChangeList changes={entry.changes} version={entry.version} />
          ) : (
            <p>
              {i === entries.length - 1
                ? 'First version.'
                : 'No earlier version to compare with.'}
            </p>
          )}
          <a
            href={versionHref(
              slug,
              entry.version,
              entry.version === api.version,
            )}
          >
            View {entry.version} reference
          </a>
        </article>
      ))}
    </div>
  );
}
