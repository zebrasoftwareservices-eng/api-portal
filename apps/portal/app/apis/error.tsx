// SPDX-License-Identifier: Apache-2.0
'use client';
import { Button } from '@portal/ui';
export default function Error({ reset }: { reset: () => void }) { return <div className="alert error stack" role="alert"><strong>APIs unavailable</strong><p>We couldn&apos;t load the published APIs.</p><Button onClick={reset}>Try again</Button></div>; }
