# ghfs

GitHub issues/PRs as filesystem, for offline view and operations in batch. Designed for human and agents.

> [!IMPORTANT]
> Still working in progress, not usable yet.

```bash
pnpm install @ghfs/cli
```

and then run the command inside a repository directory:

```bash
ghfs
```

It will sync the open issues and pull requests to the local filesystem under `.ghfs` directory, like:

```txt
.ghfs/
  repo.json   # repository basic information
  issues.md   # index of fetched issues
  pulls.md    # index of fetched pull requests
  execute.md  # queued operations
  issues/
    00134-some-bug.md
    closed/
      00135-fixed-crash.md
  pulls/
    00042-add-cache.md
    00042-add-cache.patch
    closed/
      00043-release-cleanup.md
```

Then you can view them offline, or ask your local agent to summarize them for you.

## Execute operations

`ghfs` also allows you to take actions on the issues and pull requests in batch.

`ghfs execute` merges operations from multiple sources:

1. `execute.md` (human-friendly commands)
2. `per-issue` markdown frontmatter changes (from `.ghfs/issues/**/*.md` and `.ghfs/pulls/**/*.md`)
3. `execute.yml` (explicit YAML operations)

Note: execution merge order is `execute.yml` -> `execute.md` -> `per-issue` generated operations.

### 1) `execute.md` (recommended)

`execute.md` is best for quick/manual batching:

```md
close #123 #234
set-title #125 "New title"
add-tag #125 bug, enhancement
```

### 2) Per-issue operations

Edit frontmatter directly in issue/PR markdown files:

- `title`
- `state` (`open` / `closed`)
- `labels`
- `assignees`
- `milestone`

`ghfs execute` will diff these values and generate operations automatically (for example `set-title`, `close`/`reopen`, label updates, assignee updates, milestone updates).

### 3) `execute.yml`

`ghfs sync` or `ghfs execute` will auto-create `.ghfs/execute.yml` and `.ghfs/schema/execute.schema.json` if missing.
Use `execute.yml` for explicit/low-level operations:

```yaml
# close the issue #123
- action: close
  number: 123

# change the title of the issue #125 to "New title"
- action: set-title
  number: 125
  title: New title

# add the labels "bug" and "feature" to the issue #125
- action: add-labels
  number: 125
  labels: [bug, feature]
```

Then run `ghfs execute` to preview, and `ghfs execute --run` to execute.

```bash
ghfs execute
ghfs execute --run
```

## Agent Skill

This repository ships an [agent skill](https://agentskills.io/home) at [`skills/ghfs/SKILL.md`](skills/ghfs/SKILL.md).

Install with [`skills`](https://github.com/vercel-labs/skills) CLI:

```bash
pnpx skills add antfu/ghfs
```

The `@ghfs/cli` also ship the skills into the npm package that you can have it also installed with [`skills-npm`](https://github.com/antfu/skills-npm):

```bash
pnpm i -D @ghfs/cli
pnpx skills-npm
```

## Configuration

You can configure by creating a `ghfs.config.ts` file in the root of the repository.

```ts
import type { GhfsUserConfig } from '@ghfs/cli'

export default defineConfig({
  repo: 'owner/name',
  sync: {
    issues: true, // set false to skip issue sync
    pulls: true, // set false to skip pull request sync
  },
  // other options...
})
```

## TODOs

- [x] `execute.md` file with human-friendly instructions (`close #123 #234`, `set-title #125 "New title"`).
- [x] Directly editing the `<5-digit-number>-<slug>.md` file to apply the operations.
- [ ] Add a VS Code extension for guided sync/execute.
- [ ] Documentation.
- [x] Index page, and basic repo info
- [x] Agent Skills.
- [ ] Local Web UI for managing the local mirror.
