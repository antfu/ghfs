# Rules

- CLI related logics, usage of `@clack/prompts`, `console.log` can only be under `src/cli/`
- GitHub related logics, usage of `octokit` can only be under `src/providers/github/`
- Pure/simple functions should better be under `src/utils/` and be tested alongside.
- Avoid duplicating logics, refactor them to reuse.
- Always use `pathe` instead of `node:path`
- At this moment, we don't care about breaking changes at all, don't worry about migration or backward compatibility.

## Keyboard accessibility (UI)

- Every interactive element under `ui/` must be operable without a mouse. When adding a button, tab, pill, or dialog action, pair it with either (a) native `Tab` + `Enter`/`Space` — the default focus ring must be visible — or (b) a shortcut registered in `ui/composables/useAppShortcuts.ts`, and render `<Kbd shortcut-id="..." />` next to it so the binding is discoverable.
- Text inputs & textareas get a single-key focus shortcut (e.g. `/` for search, `n` for comment). `Escape` already blurs focused inputs globally via `ui/composables/useShortcuts.ts` — do not re-implement it. Tag the element with `data-shortcut="<id>"` so the shortcut's `run()` can `querySelector` it.
- Submit-from-input (e.g. `Cmd`/`Ctrl` + `Enter` on a textarea): add a local `@keydown.meta.enter` / `@keydown.ctrl.enter` handler on the element. The global handler intentionally ignores modified key events so the registry stays simple.
- Prefer single-key shortcuts. The registry supports multi-key sequences via an 800 ms tail-match buffer (longer sequences win), but multi-key bindings are reserved for cases where every reasonable single letter already collides.
- Every new `btn-*` variant in `ui/uno.config.ts` must include `outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40`, matching the existing `tab-trigger` shortcut.
- The `?` help overlay (`ui/components/HelpOverlay.vue`) auto-renders every registered shortcut grouped by id prefix — keep each `description` short and user-facing.

## Design language (UI)

- **Primary palette**: GitHub blue (`#0969da`, accessible via `primary-500` / `color-active`). Do not introduce a second accent — semantic state colors carry the visual variation.
- **State colors** stay GitHub-native: open=green, merged=purple, closed=red, draft/not-planned=neutral, pending=yellow. Encode via `<Badge color="..." />` or `<StatePill>`. Do not invent new state colors.
- **No glass / backdrop blur.** Surfaces are flat. Use `bg-base` for opaque chrome and `bg-active` (`#8881`) for hover/selection tint. Backdrop-blur is reserved for cases the platform demands it (none currently).
- **Icons**: hybrid system.
  - Octicons (`i-octicon-*-16`) for GitHub semantics: issue/PR state, timeline event icons, labels, sync, queue list, comment threads. Reserved for things that *mean* something on GitHub.
  - Phosphor duotone (`i-ph-*-duotone`) for chrome: theme toggle, close, dropdown chevrons, edit, expand, settings, warning/info indicators. When in doubt, ask: "does this icon represent a GitHub concept?" If no → Phosphor.
- **Surfaces**: prefer the shared primitives over rolling new card scaffolding.
  - Floating chrome (navbar, drawers, toasts, dropdown menus): `panel-floating` = `bg-base` + `border border-base` + `shadow-sm`. No blur.
  - Cards / contained sections: `<Panel>` (or the `panel-card` shortcut inline) = `border border-base rounded-xl bg-base`.
  - Modal dialogs: `<Modal>` — never re-implement backdrop + escape + focus trap. It owns the `z-modal-*` layers.
  - Side drawers: `<Drawer>` — same rule.
- **Borders & depth**: use `border-base` (translucent `#8882`) and `border-active`. Avoid solid neutral hex borders. Depth comes from `shadow-sm` on floating chrome only; flat surfaces (cards, panels) rely on borders.
- **Opacity tokens**: `op-fade` (light/dark adaptive 65/55%) and `op-mute` (30/25%). Prefer these over raw `op-65`.
- **Z-index**: never write raw `z-30`/`z-50`/etc. in components. Use the named layer shortcuts from `uno.config.ts`: `z-nav`, `z-dropdown`, `z-toast`, `z-modal-backdrop`, `z-modal-content`, `z-drawer-backdrop`, `z-drawer-content`.
- **Icon buttons**: use `<IconButton>` — it owns the `w-9 h-9 rounded-full op-fade hover:op100 hover:bg-active` pattern plus focus ring, tooltip, and badge slot. The legacy `btn-icon` / `btn-circle` shortcuts remain only for non-component callers.
- **Search inputs**: use `<SearchField>` for any list filter / search box so the icon + clear-X + Kbd hint stay consistent.
- **Badges**: use `<Badge>` (or `<StatePill>` for issue/PR state). Avoid inline `bg-{color}-400/20` constructions; the `badge-color-{name}` regex shortcut covers any tailwind color.
- **Date / age display**: use `<DateBadge :time="iso" />` for any "X ago" indicator. It wraps `<DurationBadge>` with a 5-step age scale: `<1d` bright green, `<7d` green, `<30d` amber, `<90d` orange, `>=90d` pure gray (the "stale" bucket). Pass `:colorize="false"` for a permanent gray badge.
- **Authors / users**: use `<AuthorEntry :author="loginOrObject" />` instead of pairing `<Avatar>` with an inline `@login` span. Accepts either a plain login string or `{ login, avatarUrl, name }`. Set `:link="false"` when the surrounding element already navigates somewhere.
- **Virtualized lists**: long lists (issues/PRs in a project, recent items in the hub) use `<VirtualItemList>` (or the TanStack `useVirtualizer` directly when the row shape is custom). Never render thousands of `<ItemRow>` components in a plain `v-for`.
- **Activity sparkline**: `<ActivitySparkline :points="..." />` wraps `VueUiSparkline` with a curve, no axis. Use it as a background graph behind a card (`absolute inset-x-0 bottom-0 top-1/3 op-30 pointer-events-none`).
- **Settings**: a single global `<SettingsDialog>` (mounted in `app.vue`) gates every settings-style action. Add new preferences as new sections inside it; do not introduce parallel dialogs.
- **Empty states**: `<EmptyState>` for "no items", "loading", "error" placeholders. Use its `hint` slot for keyboard-shortcut footers or follow-up CTAs.
- **Testid forwarding**: every shared primitive (`Modal`, `IconButton`, `Panel`, `Badge`, `SearchField`, `Toggle`, `Drawer`, `DateBadge`, `AuthorEntry`, `VirtualItemList`, `SettingsDialog`, `ActivitySparkline`) accepts a `dataTestid` prop that lands on the root element. Add the same forwarding when introducing new primitives — the Playwright suite depends on `data-testid` staying on stable nodes.

## Keyboard shortcuts (UI)

Global shortcuts are registered in `ui/composables/useAppShortcuts.ts` and rendered next to their trigger via `<Kbd shortcut-id="..." />`. Notable global keys:

- `,` — Open Settings dialog
- `?` — Help overlay
- `u` — Hub recent activity page (hub mode)
- `Q` — Hub queue page (hub mode)
- `s` — Sync current project
- `q` — Toggle queue (drawer)
- `x` — Execute queued ops
- `/` — Focus search
- `i` / `p` — Issues / Pull-requests tab
- `j` / `k` / arrow keys — Navigate list / scroll detail
- `[` / `]` — Previous / next project (hub mode)
