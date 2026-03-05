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
  repo.json  # repository basic information
  issues.md  # index of fetched issues
  pulls.md   # index of fetched pull requests
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

## CLI feedback

`ghfs` now provides stage-based sync feedback.

- In interactive terminals (TTY), `ghfs` uses rich progress indicators.
- In CI or piped output, `ghfs` prints deterministic plain-text progress lines.

`ghfs status` now also includes diagnostics from the latest sync run (mode, duration, counters, and stage timings) from `.ghfs/.sync.json`.

## Execute operations

`ghfs` also allows you to take actions on the issues and pull requests in batch.

Create a `.ghfs/execute.yml` file with the following content:

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

Then run

```bash
ghfs execute
```

to execute the operations in batch.

When running `ghfs execute --apply`:
- Each successfully applied operation is removed from `.ghfs/execute.yml`.
- After execution, `ghfs` runs a targeted sync only for affected issue/PR numbers.

> TODO: directly editing the `<5-digit-number>-<slug>.md` file to apply the operations will be rolled out in the future.

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

- [ ] `execute.md` file with human-friendly instructions (`close #123 #234`, `set-title #125 "New title"`).
- [x] Directly editing the `<5-digit-number>-<slug>.md` file to apply the operations.
- [ ] Add a VS Code extension for guided sync/execute.
- [ ] Documentation.
- [x] Index page, and basic repo info
- [ ] Agent Skills.
