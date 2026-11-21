// SPDX-License-Identifier: Apache-2.0
'use client';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  type ReactNode,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Button, Chevron, DropdownMenu as Menu, toast } from '@portal/ui';
import type { components } from '@portal/sdk';
import { api } from '../lib/client';
export type Team = components['schemas']['TeamSummary'];
export type Role = components['schemas']['TeamRole'];
export const roleName = (role: Role) =>
  ({ admin: 'Admin', member: 'Member', 'read-only': 'Read-only' })[role];
export const roleHelp = {
  admin: 'Manages members and invitations, and can create apps and keys.',
  member: 'Creates apps and keys, and revokes keys.',
  'read-only': "Sees apps and key details. Can't create or revoke keys.",
};
const Context = createContext<{
  teams: Team[];
  current?: Team;
  unavailable?: boolean;
}>({ teams: [] });
export const useTeams = () => useContext(Context);
export function TeamBar({
  initial,
  children,
}: {
  initial?: { items: Team[]; currentTeamId: string };
  children: ReactNode;
}) {
  const [data, setData] = useState(initial);
  useEffect(() => setData(initial), [initial]);
  const [pending, setPending] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const router = useRouter();
  const pathname = usePathname();
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    let active = true;
    void api
      .GET('/v1/teams')
      .then((result) => {
        if (active) setData(result.data);
      })
      .catch(() => {
        if (active) setData(undefined);
      });
    return () => {
      active = false;
    };
  }, [pathname]);
  const current = data?.items.find((t) => t.id === data.currentTeamId);
  async function switchTeam(id: string) {
    if (pending || id === current?.id) return;
    setPending(true);
    const name = data?.items.find((t) => t.id === id)?.name;
    try {
      const result = await api.PUT('/v1/me/current-team', {
        body: { teamId: id },
      });
      if (result.error) {
        toast.error(
          result.error.status === 404
            ? `You're no longer a member of ${name}.`
            : "We couldn't switch teams. Try again.",
        );
        if (result.error.status === 404) router.refresh();
      } else {
        setData((d) => (d ? { ...d, currentTeamId: id } : d));
        setAnnouncement(`Switched to ${name}.`);
        if (
          pathname.startsWith('/dashboard/apps/') &&
          pathname !== '/dashboard/apps/new'
        )
          router.push('/dashboard');
        else if (
          pathname.startsWith('/dashboard/teams/') &&
          pathname !== '/dashboard/teams/new'
        )
          router.push(`/dashboard/teams/${id}`);
        router.refresh();
      }
    } catch {
      toast.error("We couldn't switch teams. Try again.");
    } finally {
      setPending(false);
    }
  }
  return (
    <Context.Provider
      value={{ teams: data?.items || [], current, unavailable: !current }}
    >
      <div className="team-bar stack">
        <Menu.Root>
          <Menu.Trigger asChild>
            <Button
              className="team-trigger"
              variant="secondary"
              title={current?.name}
              disabled={pending}
              aria-label={`Team: ${current?.name || 'unavailable'}. Switch team`}
            >
              {pending
                ? 'Switching…'
                : `Team: ${current?.name || 'unavailable'}`}{' '}
              <Chevron variant="menu" />
            </Button>
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Content
              className="version-menu team-menu"
              align="start"
              sideOffset={4}
            >
              {data ? (
                <>
                  <Menu.Label className="version-item">Your teams</Menu.Label>
                  <Menu.RadioGroup
                    value={data.currentTeamId}
                    onValueChange={(id) => void switchTeam(id)}
                  >
                    {data.items.map((t) => (
                      <Menu.RadioItem
                        key={t.id}
                        value={t.id}
                        className="version-item"
                      >
                        <span aria-hidden="true">
                          {t.id === data.currentTeamId ? '✓' : ''}
                        </span>
                        <span title={t.name}>{t.name}</span>
                        <small className="muted">{roleName(t.role)}</small>
                      </Menu.RadioItem>
                    ))}
                  </Menu.RadioGroup>
                  <Menu.Separator className="version-separator" />
                  <Menu.Item asChild>
                    <a
                      className="version-item"
                      href={`/dashboard/teams/${data.currentTeamId}`}
                    >
                      Team settings
                    </a>
                  </Menu.Item>
                  <Menu.Item asChild>
                    <a className="version-item" href="/dashboard/teams/new">
                      Create team
                    </a>
                  </Menu.Item>
                </>
              ) : (
                <Menu.Item
                  className="version-item"
                  onSelect={() => router.refresh()}
                >
                  Try again
                </Menu.Item>
              )}
            </Menu.Content>
          </Menu.Portal>
        </Menu.Root>
        <span className="sr-only" aria-live="polite">
          {announcement}
        </span>
      </div>
      {children}
    </Context.Provider>
  );
}
export function RoleBadge({ role }: { role: Role }) {
  return <span className={`badge role-${role}`}>{roleName(role)}</span>;
}
