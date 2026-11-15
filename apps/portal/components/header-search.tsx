// SPDX-License-Identifier: Apache-2.0
'use client';
import { usePathname } from 'next/navigation';
import { Button, Input, Label } from '@portal/ui';
export function SearchIcon() {
  return (
    <svg
      className="search-icon"
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="10.5" cy="10.5" r="7.5" />
      <path d="m16 16 5 5" />
    </svg>
  );
}
export function HeaderSearch({ variant }: { variant: 'inline' | 'icon' }) {
  if (usePathname() === '/search') return null;
  if (variant === 'icon')
    return (
      <Button asChild variant="ghost" className="header-search-icon">
        <a href="/search" aria-label="Search">
          <SearchIcon />
        </a>
      </Button>
    );
  return (
    <form
      className="header-search"
      role="search"
      action="/search"
      method="get"
      onSubmit={(event) => {
        const input = event.currentTarget.elements.namedItem(
          'q',
        ) as HTMLInputElement;
        if (!input.value.trim()) {
          event.preventDefault();
          input.focus();
        }
      }}
    >
      <Label htmlFor="header-search-q" className="sr-only">
        Search APIs and endpoints
      </Label>
      <SearchIcon />
      <Input
        id="header-search-q"
        type="search"
        name="q"
        placeholder="Search APIs and endpoints"
        maxLength={100}
        autoComplete="off"
        enterKeyHint="search"
      />
      <button type="submit" className="sr-only">
        Search
      </button>
    </form>
  );
}
