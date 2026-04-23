import { defineDiagnostics } from 'logs-sdk'

export const diagnostics = defineDiagnostics({
  docsBase: code => `https://github.com/antfu/ghfs/blob/main/docs/errors/${code.toLowerCase()}.md`,
  codes: {
    // UI errors (E0900–E0949)
    GHFS_E0900: {
      message: (p: { detail: string }) => `saveUiState failed: ${p.detail}`,
    },
    GHFS_E0901: {
      message: (p: { shortcut: string, detail: string }) => `shortcut ${p.shortcut} failed: ${p.detail}`,
    },

    // UI warnings (W0950–W0999)
    GHFS_W0950: {
      message: (p: { detail: string }) => `uiState hydrate skipped: ${p.detail}`,
      level: 'warn',
    },
  },
})
