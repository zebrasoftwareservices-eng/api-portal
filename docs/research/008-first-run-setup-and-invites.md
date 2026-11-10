# Research brief — first-run setup and inviting people

Spec 008 (JSO-236). Evidence for the product manager. This is not a spec.

## Question

When a company installs its own portal, the person deploying it needs a first admin that a stranger cannot claim, and a way to invite teammates who share apps and keys without handing them the admin console.

## Sources

Each fact below is from a page opened for this brief.

**Securing the first account**

- [GitLab Docker install](https://docs.gitlab.com/install/docker/installation/): the first login is the user `root` with a random password in `/etc/gitlab/initial_root_password`. That file is deleted on the first container restart after 24 hours. Docker Swarm can pass the initial root password as a secret instead of an environment variable.
- [Grafana configuration](https://grafana.com/docs/grafana/latest/setup-grafana/configure-grafana/): the default admin user is `admin` / `admin`, and the password is set once on first run. `disable_initial_admin_creation` skips creating that user.
- [Mattermost roles](https://docs.mattermost.com/end-user-guide/collaborate/learn-about-roles.html): the first user added to a new install becomes the system admin.
- [Mattermost signup settings](https://docs.mattermost.com/administration-guide/configure/authentication-configuration-settings.html): open signup is off by default, so later accounts need an invitation. Email invitations default to off on self-hosted installs and on for Mattermost Cloud.
- [Plausible CE configuration](https://github.com/plausible/community-edition/wiki/Configuration): `DISABLE_REGISTRATION` defaults to `invite_only` (`true` blocks everyone, `false` allows open signup, `invite_only` allows only invited people).
- [Plausible maintainers, discussion 5403](https://github.com/plausible/analytics/discussions/5403): while no user exists, login redirects to registration even if registration is disabled, because there is nothing to sign in as. Provisioning the first admin from the environment was removed. The first person who can open the registration page becomes the admin.
- [Tyk portal install](https://tyk.io/docs/portal/install/): a new portal stays in bootstrap mode and does not serve the product until someone creates the super-admin, either on a setup form in the browser or by `POST /portal-api/bootstrap` with email, password, and name.
- [Tyk API Owners](https://tyk.io/docs/portal/api-owner/): that bootstrap user is the super-admin. Later admins are labelled provider-admin and have the same capabilities. API Owners and API Consumers are separate lists.
- [Outline users and roles](https://docs.getoutline.com/s/guide/doc/users-groups-cwCxXP8R3V): the first person who signs up becomes an admin. Further people are invited from Settings. Roles are Admin, Editor, and Viewer. The guest role is not in the self-hosted community edition.
- [Outline SMTP](https://docs.getoutline.com/s/hosting/doc/smtp-cqCJyZGMIB): invitation email needs an SMTP server configured on the install.
- [Backstage guest auth](https://backstage.io/docs/auth/guest/provider/): the guest sign-in provider is disabled outside development. Turning it on in production requires `dangerouslyAllowOutsideDevelopment`. Backstage has no product invite flow; identity comes from the catalog and an identity provider.

**Invites**

- [GitLab project members](https://docs.gitlab.com/user/project/members/): the inviter picks the role. An existing account is added by username immediately. An unknown email gets an invitation, creates an account on that address, and is reminded after 2, 5, and 10 days. Unaccepted invites are deleted after 90 days.
- [Grafana organization users](https://grafana.com/docs/grafana/latest/administration/user-management/manage-org-users/): the inviter assigns Admin, Editor, or Viewer. An existing user is invited by username. A new person is invited by email and the account is created on first sign-in. Pending invites can be cancelled or the link copied. Removing someone from the organization does not delete their server account.
- [Mattermost invite](https://docs.mattermost.com/end-user-guide/collaborate/invite-people.html): email invites expire after 48 hours and work once. A team invite link works for anyone until an admin regenerates it. Existing users are added by username. An admin can invalidate every pending email invite.
- [Gravitee application members](https://documentation.gravitee.io/apim/secure-and-expose-apis/applications/user-and-group-access): an email that already matches one user is added straight away and no invite is stored. A new person gets an email with a JWT registration link, sets name and password, and joins with the role chosen on the invite. Resend issues a new token. A pending invite can be deleted. `PRIMARY_OWNER` cannot be assigned on an invite; ownership moves through a separate transfer.
- [Azure API Management: invite developers](https://learn.microsoft.com/en-us/azure/api-management/api-management-howto-create-or-invite-developers): an admin can create a developer as Active immediately, or send an invite. The invite link lasts two days. After acceptance the account becomes Active. Blocking a developer stops portal access and API calls without deleting the account.
- [Redocly: manage people](https://redocly.com/docs/platform/organization/manage-people): only an Owner sends invites. The form takes email, optional teams, and an organization role. Links expire after 7 days. Pending invites can be resent, cancelled, or copied.
- [Tyk API Consumers](https://tyk.io/docs/portal/api-consumer/): a consumer admin invites by email, chooses Admin or Team Member, and chooses teams. The invitee stays inactive until they finish registration, and joins the inviter's organisation. Invite codes are a separate path: a shared code has a use quota, an expiry date, and lands people on a team. Email must be configured or invites do not send. When a consumer admin deletes a teammate, that person's apps are reassigned to the admin rather than destroyed. When an API Owner deletes a consumer, the user and their apps and credentials are deleted.

**Staff roles and developer teams are different lists**

- [Kong Konnect organization teams](https://developer.konghq.com/konnect-platform/teams-and-roles/): staff of the Konnect org (Organization Admin, Portal Admin, and others) are invited into Konnect teams. That is the operator's console, and it runs on Konnect.
- [Kong Dev Portal developer RBAC](https://developer.konghq.com/dev-portal/developer-rbac/): registered developers sit in a second kind of team. Roles are per API: API Consumer (may call the API) and API Viewer (documentation only). A team owns applications only if "Allow team to own applications" is turned on. Developers then assign a new application to a team, or transfer an existing one. This also runs on Konnect.
- [Tyk API Owners](https://tyk.io/docs/portal/api-owner/) and [API Consumers](https://tyk.io/docs/portal/api-consumer/): API Owners run the admin portal. API Consumers use the live portal, grouped into organisations and teams. A consumer admin invites colleagues. A team member uses the APIs. Self-registration can wait for an owner to approve it.
- [Apigee integrated portal: how users interact](https://docs.apigee.com/api-platform/publish/portal/portal-interact): portal users create their own accounts. Developer teams share an app. Roles are Owner (members, team, and apps), App Admin (read members, write apps), and Viewer (read-only). The creator is an Owner. A team must keep one Owner. Adding a member takes the email of someone who already has a portal account. Deleting a team deletes the apps it owns. In this beta, app ownership is chosen at creation and cannot be transferred later.
- [Apigee: manage developer teams](https://docs.apigee.com/api-platform/publish/portal/developer-teams): the API provider does not create those teams. The integrated portal that has this feature is Apigee-managed for public cloud. A private-cloud Edge install is pointed at a separate Drupal portal.
- [Azure API Management groups](https://learn.microsoft.com/en-us/azure/api-management/api-management-howto-create-groups): three built-in groups. Administrators contains only the email given when the service was created, and people cannot be added or removed. Developers are signed-in portal users. Guests are anonymous visitors. Custom groups control which products a developer can see. They are not shared owners of an app.
- [Sentry membership](https://docs.sentry.io/organization/membership/): organization roles (Owner, Manager, Member, and others) are separate from team roles (Team Admin, Team Contributor). Managers and Owners change membership. A team invite can sit pending until a Manager, Owner, or Team Admin approves it. Open membership is the default. Deleting an organization does not delete the user accounts.
- [ReadMe teammates](https://docs.readme.com/main/docs/manage-team): teammates are the people who edit the docs project. The project creator is the Owner. Enterprise adds Admin, Editor, and Viewer. This is staff of the documentation site, not a team that shares API credentials.
- [Zuplo: share keys](https://zuplo.com/docs/articles/api-key-end-users): a consumer owns the keys. A manager is an email on that consumer. Signing in to the developer portal with that email shows the consumer's keys. The Zuplo Portal (operators) and the Developer Portal (consumers) are different products. The same key model is documented for Zuplo's self-hosted gateway.

**Hosted products do not have an unclaimed install**

Konnect, the Apigee integrated portal, Azure API Management, Redocly, ReadMe, and Zuplo's portals are vendor-hosted. The customer already has an account with the vendor before anyone can invite a colleague. The "first person to open the URL becomes admin" problem shows up on self-hosted software (Mattermost, Plausible, Outline), not on those hosted portals.

## Already covered

- **Spec 005 (JSO-234), done.** A fresh install with no admin and no gateway shows a setup screen. The engineer creates the first admin and is signed in. A second claim is refused. Public sign-up is refused until that admin exists. When `NODE_ENV=production`, the server writes a random single-use setup token to its logs and the setup screen requires it. A new token is generated on each start until an admin exists, and the token is not stored. The default compose file sets `NODE_ENV=development` and asks for no token; the docs warn not to expose that compose file to the internet. `ADMIN_EMAIL` and `ADMIN_PASSWORD` still create the admin at startup and skip that step, including in production, so GitOps does not stop on a wizard. A setup token across several server replicas is spec 016 (follow-up JSO-378).
- **Spec 001 (JSO-117), done.** A visitor can sign up and create an app that belongs to that person. Teams and orgs were out of scope.
- **Spec 007 (JSO-235), done.** SMTP, verification, password reset (link lasts one hour), and account deletion. Invites were left for spec 008. Until teams exist, deleting an account deletes that person's apps. The only admin cannot delete their account. Admin tools that act on someone else's account were left for spec 015. The hosted demo gets no built-in mail provider.
- **Spec 006 (JSO-127).** The public demo keeps a seeded admin and, on the daily reset, removes developer sessions, apps, and keys. It is a poor place to demonstrate durable teams, and it has no SMTP.
- **Spec 002 (JSO-193), done.** The static Vercel demo has no accounts.
- **Spec 015 (JSO-243), not written.** Roadmap: staff roles, registration approval, a private portal, and an audit log. Sprint 7 demo: a product owner edits only their products, sign-ups can wait for approval, and the audit log shows key revokes.
- **Spec 009 (JSO-237) and spec 010 (JSO-238), not written.** Products, plans, and approval of access requests. Per-API "may call" versus "may read the docs" belongs there, not on a team role in 008.

## Fits one pull request

**Build in spec 008:** developer teams that own apps and keys, and email invites into those teams. That matches the sprint 3 demo: invite a teammate, they accept and use the team's app, a read-only member cannot touch keys, and deleting an account or removing a member does not break the team's keys.

- A signed-in developer creates a team and becomes a member who can manage its keys. The portal admin from spec 005 can do the same. A team is a group inside this one install. It is not a second tenant, and it is not a Tyk organisation or a Konnect org.
- Two roles, chosen when the person is invited or added: **Member** (create and revoke keys on the team's apps) and **Read-only** (see the team's apps, cannot create or revoke keys). No third role in this pull request.
- Invite by email through the SMTP from spec 007. One invite, one role, one team. The link is single-use. Resend replaces the token. The sender can revoke a pending invite. If the address already has an account, accepting adds that account to the team. If it does not, accepting creates the account and then joins the team. Do not create a second account for an address that already exists.
- A person may belong to more than one team. The sprint plan's team switcher is how they choose which team's apps they are looking at. An app belongs to one owner: either one person, as today, or one team.
- Removing a member, or deleting that member's account, leaves the team's apps and their Kong keys in place. That is the change from spec 007, where a personal app dies with its owner.
- If mail is not configured, inviting is refused with the same kind of message spec 007 uses when verification cannot be turned on. The quickstart already has Mailpit, so the Friday demo runs there.

**Leave in place, from spec 005.** Do not add another setup wizard. Do not replace the production setup token with "first visitor wins." Plausible and Mattermost show why that fails on a reachable install: the first request to create an account becomes the admin, and a registration lock does not apply until that account exists. Grafana's default `admin` / `admin` is the known password spec 005 already removed. GitOps keeps `ADMIN_EMAIL` and `ADMIN_PASSWORD`.

**Split out.**

- Inviting another portal admin, staff roles, a product owner, registration approval, a private portal, and an audit log. Spec 015. Tyk, Kong, Sentry, and Azure all keep operator roles on a different list from the people who hold keys. Collapsing them makes a read-only teammate look like someone who can open Admin → Gateways.
- Reusable invite links and campaign codes (Mattermost's team link, Tyk's invite codes). A link that works more than once is how a stranger joins. Email invites are enough for one pull request.
- Per-API consumer versus viewer roles (Kong). Catalog visibility and access approval are specs 010 and 009.
- Identity-provider group mapping (Kong, Azure external groups). OIDC is later.
- Moving every existing app into a personal team. Spec 007 just shipped "an app belongs to one person." Spec 009 will change how apps subscribe. Keep today's apps on their owner, and let a member create a new app on a team.
- Hosted-demo mail, and changing the spec 006 reset. No mail provider is added for the demo.
- A setup token that works across replicas. Spec 016.

## Open questions for Elango

1. Confirm spec 008 does not reopen the spec 005 wizard, and that inviting a second portal admin waits for spec 015.
2. Are Member and Read-only enough, or do you want a third role whose only extra power is inviting and removing people?
3. Who may send an invite: any Member, or only the portal admin?
4. Should a person be on several teams in this pull request, with the switcher from the sprint plan?
5. Invite lifetime: 48 hours (Mattermost and Azure), 7 days (Redocly), or 1 hour to match the spec 007 password-reset link?
6. When the last Member leaves or deletes their account, and the team still has apps: refuse the removal, the way spec 007 refuses deletion of the only admin, or revoke the team's keys?
