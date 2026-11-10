# User-testing evidence

The user-tester writes one report per spec: `docs/uat/<spec-id>/report.md`. That file is the evidence that gets committed.

A screenshot is for an open failure, plus at most one desktop and one mobile shot of the main success. The folder holds at most 12 images, in one flat directory. A retest replaces the old failure image. It does not add `r2`, `retest`, or a dated directory. When a bug is verified fixed, delete its image and leave the sentence in the spec.

PNG files, `browser-log.jsonl`, `network.json`, and `console.json` under `docs/uat/` are gitignored. Attach a failure image to the Linear bug. Do not commit a console or network dump. Quote the one error line in the report.

Images already tracked before this rule stay in git history. Do not add another round beside them.
