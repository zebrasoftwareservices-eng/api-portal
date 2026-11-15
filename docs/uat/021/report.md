# Spec 021 user acceptance retest

Date: 2026-11-15. Tested commit: `d0a92bee1f3049fccb0617811df28b34d03d512b`.
Portal: http://localhost:3020. Orca embedded browser, desktop 1280×900 and mobile 390×844 at scale 1.

This is a retest of the failed User testing row and current open bugs. Previously passing acceptance journeys were not repeated. The portal was initially unreachable, so the existing QA Compose stack was started with `node scripts/worktree-compose.mjs up -d --wait`.

| User story / failed check | Result | What I saw |
| --- | --- | --- |
| Choose and retain Node.js Fetch samples | FAIL — minor, still open | On `/apis/sample`, More → Node.js → Fetch displayed “Node.js Fetch”; reload changed the operation buttons to “Shell Curl”. After reload, the saved client value was also `shell/curl`. |
| Missing reference/changelog pages return the correct status | PASS | Browser fetches of `/apis/uat-missing-021` and `/apis/uat-missing-021/changelog` both returned HTTP 404. The unrelated `/apis` path also displayed “Page not found”. Restricted fixture coverage remains in QA's report. |
| Version controls align on desktop | PASS | “Version 1.0.0 Latest” and “Changelog” both have vertical centre 206px at 1280×900; “Copy” remains present. The earlier title-alignment complaint is resolved against the designed version row. |
| Version controls fit on mobile | PASS | At 390×844, Changelog and View as Markdown share y=231.8px; Download spec spans the 358px content width. Document scroll width is 390px, with no horizontal overflow. |
| Keyboard use of the reference controls | PASS | Tab navigation reached “More Select from all clients”; Enter opened the language picker and Escape dismissed it. This focused keyboard check covers the retested sample controls. |
| Catalog smoke-test heading ambiguity | STILL OPEN — minor test maintenance | Catalog `/` displays both heading level 1 “APIs” and heading level 2 “APIs”, confirming the ambiguous target described by QA. The automated test was not rerun or read during UAT. |

No blocker or major was found; the two open findings remain minor and status is review. Existing bugs were updated with the factory `linear bug` commands; no new durable issue was needed.

Console check: `orca console --limit 50 --json` returned only info entries, including `addDocument: 40 ms`. There was no error-level entry to quote; no console error has been invented or console dump saved.

No new screenshots were needed: all remaining findings can be quoted as text. Deleted the resolved `version-alignment-fail.png`; the existing local `success-mobile.png` remains uncommitted. The evidence folder is flat with one PNG, below the 12-image cap. The stack was stopped after testing.
