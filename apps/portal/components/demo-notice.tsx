// SPDX-License-Identifier: Apache-2.0
import { isDemo, QUICKSTART_URL } from '../lib/demo';
import { QuickstartCommand } from './quickstart-command';
export function DemoNotice() {
  if (!isDemo()) return null;
  return (
    <section className="demo-notice" aria-label="Demo notice">
      <div className="demo-notice-inner">
        <p>
          <strong>This is a demo</strong> with a sample API. Sign-up, API keys,
          try-it and admin need the quickstart.
        </p>
        <QuickstartCommand>
          <a href={QUICKSTART_URL}>Quickstart instructions on GitHub</a>
        </QuickstartCommand>
      </div>
    </section>
  );
}
