---
id: 016
title: Production install — hardened Compose, Helm chart, backups and upgrades
status: draft   # draft → ready → designed → building → testing → uat → review → approved → done
owner: product-manager
created: 2026-11-13
linear: JSO-244
---

# 016 — Production install: hardened Compose, Helm chart, backups and upgrades

## Summary
A platform engineer installs the portal on a company server (Docker Compose on a Linux VM, or
Helm on Kubernetes) from versioned images, keeps it backed up, and upgrades or rolls back
without losing data.

## Problem
Today the only install is `deploy/docker-compose.yml`, the evaluation stack. The README tells
readers not to expose it: it runs with `NODE_ENV=development`, builds from source and bundles
Kong. `deploy/hosted/` is hardened, but it is the ZSS demo and its backup exists to wipe visitor
data. There are no git tags, no GitHub releases and no image-publish workflow (spec 005's test
report; `gh release list` is empty, `.github/workflows/` has only `ci.yml`). So a company that
wants to run the portal for real has no supported way to install it, back it up, or upgrade it,
and no proof that an upgrade keeps its developers' apps and keys.

It is solved when (from JSO-244 and the Sprint 7 demo in `docs/roadmap.md`):
- someone with repo access installs the portal on a clean Ubuntu 26.04 LTS VM from the guide in
  under 30 minutes;
- upgrading from the previous release tag keeps all data;
- the Helm chart passes a smoke test on a throwaway Kubernetes cluster in CI.

Evidence and sources: [`docs/research/JSO-244.md`](../research/JSO-244.md). Similar products split
evaluation and production installs the same way: Docker for proof of concept, a separate
production path ([Tyk](https://tyk.io/docs/tyk-self-managed/tyk-helm-chart/)); pinned image tags
and forward-only migrations, so rollback is not `helm rollback`
([Gravitee](https://documentation.gravitee.io/apim/self-hosted-installation-guides/kubernetes));
bundled chart Postgres only for temporary environments
([Kong charts](https://github.com/Kong/charts/blob/main/charts/kong/README.md)); a single portal
instance plus a database is a legitimate production shape, the gateway stays outside, and the
operator sets the public base URL
([WSO2 API Portal](https://wso2.com/bijira/docs/api-portal/1.0.0/deployment/overview/)).

## Users
- **Platform engineer** — installs, backs up, upgrades and rolls back the portal on company
  infrastructure, and connects it to a Kong they already run.
- **Portal admin** — claims the first admin on a production install (spec 005's setup token)
  and relies on data surviving upgrades.
- **API consumer (developer)** — indirectly: their apps and keys must survive upgrades and restores.

## User stories
- As a platform engineer, I want a production Compose file that pulls pinned images, takes
  secrets from an env file or files, and sits behind my TLS reverse proxy, so that I can run the
  portal on a company VM without building from source or exposing the database.
- As a platform engineer, I want versioned server and portal images on GitHub Container Registry,
  so that I know exactly what I run and can go back to it.
- As a platform engineer, I want a documented backup, restore and rollback, so that a bad upgrade
  or a lost disk does not lose my developers' apps and keys.
- As a platform engineer on Kubernetes, I want a Helm chart with health and readiness probes and
  an option to use my own PostgreSQL, so that the portal fits how my cluster already runs.
- As a portal admin on a chart with more than one server replica, I want the setup token from any
  replica's log to work, so that I can claim the first admin whichever pod serves me (JSO-378).

## Acceptance criteria
1. **Given** a clean Ubuntu 26.04 LTS VM with Docker Engine and Compose v2, a Kong the company
   already runs, and access to this repo's GHCR packages, **When** a person follows the install
   guide using the production Compose file, secrets supplied as files, and the guide's reverse
   proxy example, **Then** within 30 minutes the portal is served over HTTPS at the configured
   public URL, the server runs with `NODE_ENV=production`, Postgres and the server API are not
   published on any host port, no sample API is seeded, no Kong container runs, and the admin can
   claim the install with the setup token and connect the existing Kong.
2. **Given** the production Compose file **When** it is started with a required secret missing
   (for example the database password or `PORTAL_ENCRYPTION_KEY`, from neither env nor file),
   **Then** the server exits non-zero before serving any request, and its log names the missing
   setting without printing any secret value.
3. **Given** a version tag is pushed to the repo **When** the release workflow finishes, **Then**
   the server and portal images are published to GHCR tagged with exactly that version, the
   packages stay private, and no `latest` tag is pushed or moved.
4. **Given** the previous release tag is running with data (an admin, a published API, a
   developer, an app with a key) **When** the new tag is started against the same database
   volume, **Then** migrations apply on start, the admin and developer can sign in, and the API,
   app and key are all still listed. This runs in CI.
5. **Given** a running production install with data **When** the operator runs the documented
   backup command, deletes an app, then runs the documented restore command with that backup,
   **Then** the deleted app is back, every other record matches the backup, and the backup step
   itself changed no data.
6. **Given** an install upgraded to the new tag, and a backup taken before the upgrade **When** the
   operator follows the guide's rollback (stop, restore the pre-upgrade backup, start the previous
   tag), **Then** the previous version runs and shows the pre-upgrade data.
7. **Given** a throwaway Kubernetes cluster in CI at the chart's declared `kubeVersion` **When** the
   Helm chart is installed with default values, **Then** the portal, server and Postgres pods
   become Ready, the portal answers through its Service, every container runs as a non-root user,
   and the release creates no Kong, cert-manager or ingress-controller resources.
8. **Given** the Helm chart **When** it is installed with an external database URL value, **Then**
   no Postgres pod is created and the server becomes Ready against that database; **and when** it
   is installed with ingress enabled but no public URL value, **Then** `helm install` fails with a
   message naming the missing value.
9. **Given** a running Helm install **When** the database becomes unreachable, **Then** the server's
   readiness check fails and the pod leaves the Service endpoints while its liveness check keeps
   passing; **when** the database returns, **Then** the pod is Ready again without a restart.
10. **Given** a Helm install with two server replicas and no admin yet **When** the setup token
    printed by one replica is submitted on a request served by the other, **Then** it is accepted
    and the admin is created; **and** after that, the token is rejected by both replicas.

## Out of scope
- **Replacing the quickstart.** `deploy/docker-compose.yml`, its bundled Kong, the optional sample
  and the five-minute rule stay as they are. Production is a separate file.
- **Changing `deploy/hosted/`** (spec 006). The demo keeps its Caddy and its daily reset. A
  company backup must never reset the database.
- **High availability as a supported topology**: several replicas as a promise, HA Postgres,
  PodDisruptionBudgets, autoscaling, multi-zone. One replica stays the default. Criterion 10
  only makes the setup token safe if someone scales up. WSO2 also treats HA as extra.
- **Installing, upgrading or securing the company's Kong.** Kong's own chart does that; the guide
  points at `docs/connect-kong.md` and spec 005's settings.
- **Down migrations.** Migrations stay forward-only; rollback is restore plus the previous tag
  (Elango, 2026-11-13).
- **TLS inside the portal, cert-manager, Vault, external-secrets, OpenShift, air-gapped mirrors,
  Windows hosts and marketplace listings.** Later specs if asked for.
- **A second VM walkthrough.** Ubuntu 24.04 LTS is named as expected to work, not walked.
- **Booting a cloud VM in CI.** The user-tester walks the VM guide; CI covers the chart and the upgrade.
- **Making the repo or GHCR packages public, and cutting `v0.8.0`.** Elango does that himself after
  specs 015 and 016 merge, once he has walked the guide and checked the git history (decision
  2026-11-13). Merging this spec does not publish anything.
- **Any UI change.** No new screens; the ui-designer stage has no work.

## Open questions
- [ ] **What is "the previous release tag" for criterion 4?** No tag or image exists yet. Does the
  first release workflow run publish a baseline tag from current `main` (for example `v0.7.0`)
  before this spec's own tag, so CI has something to upgrade from? — Elango, with tech-lead
- [ ] **Which Kubernetes minor does the chart declare?** The decision is "the one the CI cluster
  runs"; the tech-lead names it in the install-paths ADR. — tech-lead
- [ ] **Should the server refuse to start when the database schema is newer than it knows** (an
  old tag started against an upgraded database without a restore), with a log line pointing to
  the rollback steps? That would add a failure-path criterion. — tech-lead, Elango
- [ ] **Where does the shared setup token live**: a database row or a chart-managed Secret? Both
  meet criterion 10; it changes the Compose path too. — tech-lead
- [ ] **Which reverse proxy does the guide show** (Caddy, as in `deploy/hosted/`, or nginx)? One
  example only. — tech-lead

---
<!-- Sections below are filled by later stages. -->

## Technical design  _(tech-lead)_
Components · API contract · Data model · Adapter calls · Risks

### Tasks
- [ ] [backend] …
- [ ] [frontend] …
- [ ] [qa] …

## UX  _(ui-designer)_
Summary + link to `docs/design/NNN-*.md`

## Build notes  _(backend-developer, frontend-developer)_

## Test report  _(qa-tester)_
Commit tested: `<sha>` · Portal: `<url from worktree-compose env>`

| Criterion | Test file | Result |
| --- | --- | --- |

Long notes go in `docs/specs/log/016.md`, not here.

### Bugs
<!-- Track every finding here. `node scripts/factory.mjs linear issue <id> bug|review` adds a key for a blocker or major only. -->
<!-- Examples: - [ ] Revoke leaves the Kong credential (minor); - [ ] JSO-140 Revoke leaves the Kong credential (major) -->
- [ ] …

## User testing  _(user-tester)_
| User story | Result | Evidence |
| --- | --- | --- |

One row per user-visible criterion. Evidence is a short quote of what was on the screen.
Name an image only for an open failure. On a retest, change only the failed rows.
Earlier rounds go in `docs/specs/log/016.md`. The full report is `docs/uat/016/report.md`.

## Review  _(tech-lead)_
`blocking` findings get a Fix task. `suggestion` findings do not, and they do not
return the spec to building. Earlier rounds go in `docs/specs/log/016.md`.

## Definition of Done
- [ ] Every acceptance criterion has a passing automated test
- [ ] Every user story passes in the browser (User testing section)
- [ ] lint, typecheck, unit, integration and e2e all green in CI
- [ ] Quickstart (`docker compose up`) still works end to end
- [ ] API contract, README and docs updated
- [ ] Tech-lead review has no blocking findings
- [ ] Elango merged the PR
