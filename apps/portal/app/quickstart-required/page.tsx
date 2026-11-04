// SPDX-License-Identifier: Apache-2.0
import { notFound } from 'next/navigation';
import { isDemo, QUICKSTART_URL } from '../../lib/demo';
import { QuickstartCommand } from '../../components/quickstart-command';
// This route has no live data; resolve its non-demo 404 before streaming.
export const dynamic = 'force-static';
export const metadata = { title: 'Quickstart required' };
export default function QuickstartRequired() {
  if (!isDemo()) notFound();
  return (
    <div className="form stack quickstart-required">
      <h1>This feature needs the quickstart</h1>
      <p>
        Sign-up, API keys, try-it and admin need a portal server and a Kong
        gateway. This hosted demo has neither, so they&apos;re turned off here.
      </p>
      <p>
        Run the portal on your own machine to use them. It needs Docker with
        Compose and starts in under five minutes.
      </p>
      <QuickstartCommand />
      <div className="row actions">
        <a className="button" href={QUICKSTART_URL}>
          Quickstart instructions on GitHub
        </a>
        <a className="button secondary" href="/">
          Go to APIs
        </a>
      </div>
    </div>
  );
}
