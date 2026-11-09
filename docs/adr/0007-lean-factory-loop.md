# ADR 0007 — The factory coordinator sleeps, and one Claude stage runs at a time

- Status: Proposed (accept by merging)
- Date: 2026-11-09

## Context

One spec was spending a Claude session for the whole time Codex was building and testing,
because the coordinator polled Orca until the workers finished. Every role also re-read the
whole spec, including earlier test rounds, and QA, the user-tester, and review each ran the
suite. Two features in design or review at once used the same Claude allowance. Minor findings
sent specs back to building, which repeated that cost.

Orca already wakes a coordinator when a worker finishes or asks a question. A polling check
takes that mail.

Linear rejected a new issue for this change on 2026-11-09: the workspace was at its free issue
limit. The intended issue is "Make the factory cheaper to run", team JSO, project API Portal,
priority medium, state In Progress. Create it when the limit allows. The open follow-ups this
branch also covers are JSO-407 (compose project, image, and port collisions), JSO-408 (try-it
rate-limit buckets shared across live runs), and JSO-410 (portal unit tests on Node 25+).

## Decision

- The coordinator starts a stage's workers and ends its turn. It does not poll. Orca wakes it.
  Workers append the stage summary to `docs/specs/log/<id>.md`. The coordinator posts that
  summary to the feature issue.
- Developers run tests for the packages they changed and push the feature branch. QA runs the
  full suite and the quickstart once, and leaves that stack up. The user-tester reuses it and
  walks each user-visible acceptance criterion once, plus one mobile pass and one keyboard pass.
  Review reads the test report and the diff. CI on the pushed branch is the second full run.
- A minor finding or a review suggestion stays in the spec. It does not create a Fix task and
  does not send the spec back to building.
- Agents read tasks and bugs from the spec (`factory linear read`) and tick one line with
  `linear task` or `linear bug`. That also moves a keyed durable issue. A child issue is
  created only for a blocker or major (`linear issue`). Follow-ups stay in the spec. The
  feature issue moves only when the spec status changes. A rejected create is written into
  the spec and does not stop the factory.
- `node scripts/factory.mjs start` refuses another feature while a spec is in `ready`,
  `designed`, or `review`. `--allow-parallel-claude` is the explicit override.
- Grok sits beside the loop as the researcher. One pass writes a brief in `docs/research/`
  before a spec exists. A separate pass reviews the open specs and records follow-ups in the
  spec. The coordinator does not launch it. Claude and Codex keep their stages.
- Parallel checkouts run Compose through `node scripts/worktree-compose.mjs`, which gives each
  checkout its own project name, image tags, and host ports. The documented
  `docker compose -f deploy/docker-compose.yml up` command is unchanged.
- The local server can drop its in-memory try-it buckets when given the local reset token.
  Production does not register that route and refuses the token. Portal unit tests pass
  `--no-experimental-webstorage` on Node 25+.

Who approves a spec and who merges are unchanged. Which subscription plays a role inside the spec loop is unchanged.

## Consequences

- Claude time per spec drops to the design, UX, and review turns, plus a short wake between
  Codex stages. A closed coordinator tab still needs `node scripts/factory.mjs resume <id>`.
- A spec returns to building only for a blocker, a major bug, or a blocking review finding.
- Two worktrees can run the quickstart together. The main checkout keeps ports 3000, 4000,
  8000, and 8001.
- The reset route exists only outside production. The token is the same kind of local default
  as the development admin password. Hosted production does not set it.
