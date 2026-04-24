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
