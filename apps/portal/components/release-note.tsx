// SPDX-License-Identifier: Apache-2.0
'use client';
import { useState } from 'react';
import { Button } from '@portal/ui';
export function PlainReleaseNote({ note }: { note: string | null }) {
  const [expanded, setExpanded] = useState(false);
  if (!note) return <p className="muted">No release note.</p>;
  const long = note.split('\n').length > 12 || note.length > 1200;
  return (
    <div>
      <p
        className="release-note"
        style={
          long && !expanded
            ? {
                display: '-webkit-box',
                WebkitLineClamp: 12,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }
            : undefined
        }
      >
        {note}
      </p>
      {long && (
        <Button
          variant="ghost"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? 'Show less' : 'Show full note'}
        </Button>
      )}
    </div>
  );
}
