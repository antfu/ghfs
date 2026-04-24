import { defineDiagnostics } from 'logs-sdk'

export const diagnostics = defineDiagnostics({
  docsBase: code => `https://github.com/antfu/ghfs/blob/main/docs/errors/${code.toLowerCase()}.md`,
  codes: {
    // Auth (0001–0009)
    GHFS0001: {
      message: 'Missing GitHub token.',
      fix: 'Set GH_TOKEN or GITHUB_TOKEN, or run `gh auth login`.',
    },
    GHFS0002: {
      message: 'Token prompt cancelled.',
      fix: 'Re-run the command and provide a token when prompted, or set GH_TOKEN/GITHUB_TOKEN.',
    },

    // Repo resolution (0010–0019)
    GHFS0010: {
      message: (p: { value: string }) => `Invalid --repo value: ${p.value}`,
      fix: 'Use `owner/name`, a full GitHub URL, or a git remote URL.',
    },
    GHFS0011: {
      message: (p: { value: string }) => `Invalid repo in ghfs.config.ts: ${p.value}`,
      fix: 'Use `owner/name`, a full GitHub URL, or a git remote URL.',
    },
    GHFS0012: {
      message: 'Repository selection cancelled.',
      fix: 'Pass `--repo owner/name` or set `repo` in ghfs.config.ts to select non-interactively.',
    },
    GHFS0013: {
      message: (p: { value: string }) => `Invalid repository selection: ${p.value}`,
      fix: 'Pick one of the detected candidates or pass `--repo` explicitly.',
    },
    GHFS0014: {
      message: (p: { gitRepo: string, pkgRepo: string }) => `Repo mismatch detected. git=${p.gitRepo} package.json=${p.pkgRepo}.`,
      fix: 'Use `--repo` to disambiguate.',
    },
    GHFS0015: {
      message: 'Could not resolve repository.',
      fix: 'Provide `--repo` or set `repo` in ghfs.config.ts.',
    },
    GHFS0016: {
      message: (p: { repo: string }) => `Invalid repo slug: ${p.repo}`,
      fix: 'Use the `owner/name` form.',
    },

    // Execute errors (0100–0149)
    GHFS0100: {
      message: 'Interactive execute prompts are unavailable.',
      fix: 'Use `--non-interactive` or provide prompts.',
    },
    GHFS0101: {
      message: (p: { remoteUpdatedAt: string }) => `Operation conflict: remote updated_at=${p.remoteUpdatedAt}`,
      fix: 'Re-run `ghfs sync` to refresh tracked state, then retry the operation.',
    },
    GHFS0102: {
      message: 'Execution cancelled.',
    },
    GHFS0103: {
      message: (p: { action: string }) => `Unsupported action: ${p.action}`,
      fix: 'Use one of the supported action names. See README for the list.',
    },
    GHFS0104: {
      message: (p: { action: string, issue: string }) => `Action ${p.action} requires ${p.issue} to be a pull request.`,
    },
    GHFS0105: {
      message: (p: { detail: string }) => `Failed to parse execute YAML: ${p.detail}`,
      fix: 'Check the YAML syntax in execute.yml.',
    },
    GHFS0106: {
      message: (p: { detail: string }) => `Invalid execute file: ${p.detail}`,
      fix: 'Verify that every operation has the required fields and allowed types.',
    },
    GHFS0107: {
      message: (p: { detail: string }) => `Invalid execute file: ${p.detail}`,
      fix: 'Use one of the supported action names.',
    },
    GHFS0108: {
      message: (p: { detail: string }) => `Invalid execute file: ${p.detail}`,
      fix: 'Fix the listed rule violations and retry.',
    },

    // Execute parser warnings (0150–0169)
    GHFS0150: {
      message: 'invalid quoted string syntax',
      level: 'warn',
    },
    GHFS0151: {
      message: (p: { command: string }) => `unrecognized action pattern: ${p.command}`,
      level: 'warn',
    },
    GHFS0152: {
      message: (p: { command: string, syntax: string }) => `${p.command} expects: ${p.syntax}`,
      level: 'warn',
    },
    GHFS0153: {
      message: (p: { command: string }) => `${p.command} expects a single issue reference (#123)`,
      level: 'warn',
    },
    GHFS0154: {
      message: (p: { command: string }) => `${p.command} requires at least one label`,
      level: 'warn',
    },
    GHFS0155: {
      message: (p: { command: string }) => `${p.command} requires at least one assignee`,
      level: 'warn',
    },
    GHFS0156: {
      message: (p: { command: string }) => `${p.command} requires a non-empty comment`,
      level: 'warn',
    },
    GHFS0157: {
      message: (p: { command: string }) => `${p.command} expects one or more issue references (#123 #456)`,
      level: 'warn',
    },
    GHFS0160: {
      message: (p: { issue: string, path: string }) => `per-item: missing markdown for ${p.issue} (${p.path})`,
      level: 'warn',
    },
    GHFS0161: {
      message: (p: { issue: string }) => `per-item: invalid or missing frontmatter for ${p.issue}`,
      level: 'warn',
    },

    // Server / queue (0200–0249)
    GHFS0200: {
      message: 'A sync is already in progress.',
      fix: 'Wait for the current sync to finish, then retry.',
    },
    GHFS0201: {
      message: 'An execute is already in progress.',
      fix: 'Wait for the current execute run to finish, then retry.',
    },
    GHFS0202: {
      message: (p: { id: string }) => `Queue entry not found: ${p.id}`,
    },
    GHFS0203: {
      message: (p: { target: string }) => `Cannot remove a per-item edit from the queue. Edit ${p.target} directly to adjust it.`,
    },
    GHFS0204: {
      message: 'execute.md not found; cannot remove op.',
    },
    GHFS0205: {
      message: (p: { source: string }) => `Cannot edit ${p.source} ops from the queue panel.`,
    },
    GHFS0206: {
      message: (p: { detail: string }) => p.detail,
    },

    // Provider (0300–0349)
    GHFS0300: {
      message: (p: { issue: string }) => `Unexpected patch response for pull ${p.issue}.`,
    },
    GHFS0301: {
      message: (p: { value: string }) => `Milestone not found: ${p.value}`,
      fix: 'Create the milestone on GitHub, or pass its numeric id.',
    },

    // Sync (0400–0449)
    GHFS0400: {
      message: 'Sync context was not initialized.',
    },
    GHFS0401: {
      message: (p: { issue: string }) => `Missing tracked canonical data for ${p.issue}.`,
    },
  },
})
