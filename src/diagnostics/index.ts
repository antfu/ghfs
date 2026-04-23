import { defineDiagnostics } from 'logs-sdk'

export const diagnostics = defineDiagnostics({
  docsBase: code => `https://github.com/antfu/ghfs/blob/main/docs/errors/${code.toLowerCase()}.md`,
  codes: {
    // Auth (E0001–E0009)
    GHFS_E0001: {
      message: 'Missing GitHub token.',
      fix: 'Set GH_TOKEN or GITHUB_TOKEN, or run `gh auth login`.',
    },
    GHFS_E0002: {
      message: 'Token prompt cancelled.',
      fix: 'Re-run the command and provide a token when prompted, or set GH_TOKEN/GITHUB_TOKEN.',
    },

    // Repo resolution (E0010–E0019)
    GHFS_E0010: {
      message: (p: { value: string }) => `Invalid --repo value: ${p.value}`,
      fix: 'Use `owner/name`, a full GitHub URL, or a git remote URL.',
    },
    GHFS_E0011: {
      message: (p: { value: string }) => `Invalid repo in ghfs.config.ts: ${p.value}`,
      fix: 'Use `owner/name`, a full GitHub URL, or a git remote URL.',
    },
    GHFS_E0012: {
      message: 'Repository selection cancelled.',
      fix: 'Pass `--repo owner/name` or set `repo` in ghfs.config.ts to select non-interactively.',
    },
    GHFS_E0013: {
      message: (p: { value: string }) => `Invalid repository selection: ${p.value}`,
      fix: 'Pick one of the detected candidates or pass `--repo` explicitly.',
    },
    GHFS_E0014: {
      message: (p: { gitRepo: string, pkgRepo: string }) => `Repo mismatch detected. git=${p.gitRepo} package.json=${p.pkgRepo}.`,
      fix: 'Use `--repo` to disambiguate.',
    },
    GHFS_E0015: {
      message: 'Could not resolve repository.',
      fix: 'Provide `--repo` or set `repo` in ghfs.config.ts.',
    },
    GHFS_E0016: {
      message: (p: { repo: string }) => `Invalid repo slug: ${p.repo}`,
      fix: 'Use the `owner/name` form.',
    },

    // Execute errors (E0100–E0149)
    GHFS_E0100: {
      message: 'Interactive execute prompts are unavailable.',
      fix: 'Use `--non-interactive` or provide prompts.',
    },
    GHFS_E0101: {
      message: (p: { remoteUpdatedAt: string }) => `Operation conflict: remote updated_at=${p.remoteUpdatedAt}`,
      fix: 'Re-run `ghfs sync` to refresh tracked state, then retry the operation.',
    },
    GHFS_E0102: {
      message: 'Execution cancelled.',
    },
    GHFS_E0103: {
      message: (p: { action: string }) => `Unsupported action: ${p.action}`,
      fix: 'Use one of the supported action names. See README for the list.',
    },
    GHFS_E0104: {
      message: (p: { action: string, issue: string }) => `Action ${p.action} requires ${p.issue} to be a pull request.`,
    },
    GHFS_E0105: {
      message: (p: { detail: string }) => `Failed to parse execute YAML: ${p.detail}`,
      fix: 'Check the YAML syntax in execute.yml.',
    },
    GHFS_E0106: {
      message: (p: { detail: string }) => `Invalid execute file: ${p.detail}`,
      fix: 'Verify that every operation has the required fields and allowed types.',
    },
    GHFS_E0107: {
      message: (p: { detail: string }) => `Invalid execute file: ${p.detail}`,
      fix: 'Use one of the supported action names.',
    },
    GHFS_E0108: {
      message: (p: { detail: string }) => `Invalid execute file: ${p.detail}`,
      fix: 'Fix the listed rule violations and retry.',
    },

    // Execute parser warnings (W0150–W0169)
    GHFS_W0150: {
      message: 'invalid quoted string syntax',
      level: 'warn',
    },
    GHFS_W0151: {
      message: (p: { command: string }) => `unrecognized action pattern: ${p.command}`,
      level: 'warn',
    },
    GHFS_W0152: {
      message: (p: { command: string, syntax: string }) => `${p.command} expects: ${p.syntax}`,
      level: 'warn',
    },
    GHFS_W0153: {
      message: (p: { command: string }) => `${p.command} expects a single issue reference (#123)`,
      level: 'warn',
    },
    GHFS_W0154: {
      message: (p: { command: string }) => `${p.command} requires at least one label`,
      level: 'warn',
    },
    GHFS_W0155: {
      message: (p: { command: string }) => `${p.command} requires at least one assignee`,
      level: 'warn',
    },
    GHFS_W0156: {
      message: (p: { command: string }) => `${p.command} requires a non-empty comment`,
      level: 'warn',
    },
    GHFS_W0157: {
      message: (p: { command: string }) => `${p.command} expects one or more issue references (#123 #456)`,
      level: 'warn',
    },
    GHFS_W0160: {
      message: (p: { issue: string, path: string }) => `per-item: missing markdown for ${p.issue} (${p.path})`,
      level: 'warn',
    },
    GHFS_W0161: {
      message: (p: { issue: string }) => `per-item: invalid or missing frontmatter for ${p.issue}`,
      level: 'warn',
    },

    // Server / queue (E0200–E0249)
    GHFS_E0200: {
      message: 'A sync is already in progress.',
      fix: 'Wait for the current sync to finish, then retry.',
    },
    GHFS_E0201: {
      message: 'An execute is already in progress.',
      fix: 'Wait for the current execute run to finish, then retry.',
    },
    GHFS_E0202: {
      message: (p: { id: string }) => `Queue entry not found: ${p.id}`,
    },
    GHFS_E0203: {
      message: (p: { target: string }) => `Cannot remove a per-item edit from the queue. Edit ${p.target} directly to adjust it.`,
    },
    GHFS_E0204: {
      message: 'execute.md not found; cannot remove op.',
    },
    GHFS_E0205: {
      message: (p: { source: string }) => `Cannot edit ${p.source} ops from the queue panel.`,
    },
    GHFS_E0206: {
      message: (p: { detail: string }) => p.detail,
    },

    // Provider (E0300–E0349)
    GHFS_E0300: {
      message: (p: { issue: string }) => `Unexpected patch response for pull ${p.issue}.`,
    },
    GHFS_E0301: {
      message: (p: { value: string }) => `Milestone not found: ${p.value}`,
      fix: 'Create the milestone on GitHub, or pass its numeric id.',
    },

    // Sync (E0400–E0449)
    GHFS_E0400: {
      message: 'Sync context was not initialized.',
    },
    GHFS_E0401: {
      message: (p: { issue: string }) => `Missing tracked canonical data for ${p.issue}.`,
    },
  },
})
