# E2E coverage TODO

The current suite is intentionally minimal — smoke tests per route that
verify the page mounts, primary content renders, and no `pageerror` fires.
The UI is moving quickly enough right now that detailed assertions were
fighting churn instead of catching regressions.

Restore the following once the surface stabilises (group ↔ likely spec
file in parentheses):

## ui mode (`tests/e2e/ui.spec.ts`)

- Tabs (Issues ↔ Pull requests) toggle the list, counts update.
- Search field filters the list; clearing it restores the full set.
- Clicking an item populates the detail panel and updates the URL segment.
- `q` toggles the queue drawer.
- `?` opens the help overlay.
- `,` opens the settings dialog.
- Selecting an item updates `/n`; reloading restores selection.

## hub mode (`tests/e2e/hub.spec.ts`)

- Project cards sort by `lastActivityAt` (most recent first).
- Hub summary aggregates open issues + open PR counts across projects.
- Activity sparkline renders behind the card when buckets are non-zero.
- `[` / `]` step through projects; `b` returns to `/`.
- Project switcher dropdown navigates between projects.
- Search inside a project filters to the current project only.
- `j` focuses the first hub card; `g g` / `G` jump to first / last.
- `m` opens the Manage projects picker; toggling adds/removes a project.
- Manage projects dialog renders icons + add/enabled pills.
- Settings dialog (`,`) round-trips hub root + auto-sync interval; invalid
  hub root surfaces an error inline.
- `/recent` shows items from every project, sorted by `updatedAt`;
  clicking a row routes to `/{owner}/{repo}/{number}` with selection.
- `/queue` aggregates entries per project; per-project Execute fires
  the right RPC; "Execute all" runs sequentially.
- Hub queue drawer opens from the navbar quick-view button and closes on
  Escape.

## Cross-cutting

- DateBadge color scales render the expected classes for known durations
  (freshness <1d / <7d / <90d / >=90d; staleness gray / yellow / orange / red).
- AuthorEntry renders avatar + login; fallback icon appears when the
  avatar URL 404s.
- VirtualItemList keeps the DOM row count bounded as the list grows.
- Timeline `cross-referenced` events render the source link with #number
  and (when present) repo + title.
