# Research briefs

Grok writes these before a spec exists, and writes a board review when Elango asks.
The product manager reads a brief as evidence. The factory coordinator does not launch this pass.

| File | When |
| --- | --- |
| `<slug>.md` | `node scripts/factory.mjs prompt researcher --idea "<text>"` |
| `<KEY>.md` | `node scripts/factory.mjs prompt researcher --linear <KEY>` |
| `board-<YYYY-MM-DD>.md` | `node scripts/factory.mjs prompt researcher --board` |

The slug matches the factory slug: lowercase, words joined by hyphens, at most 40 characters.
