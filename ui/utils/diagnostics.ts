import type { Diagnostic } from 'nostics'
import { defineDiagnostics, reporterLog } from 'nostics'
import { devReporter } from 'nostics/reporters/dev'

const reporterError = (d: Diagnostic) => reporterLog(d, { method: 'error' })

export const diagnostics = defineDiagnostics({
  docsBase: code => `https://github.com/antfu/ghfs/blob/main/docs/errors/${code.toLowerCase()}.md`,
  codes: {
    // UI errors (E0900–E0949)
    GHFS0900: {
      why: (p: { detail: string }) => `saveUiState failed: ${p.detail}`,
    },
    GHFS0901: {
      why: (p: { shortcut: string, detail: string }) => `shortcut ${p.shortcut} failed: ${p.detail}`,
    },

    // UI warnings (W0950–W0999)
    GHFS0950: {
      why: (p: { detail: string }) => `uiState hydrate skipped: ${p.detail}`,
    },
  },
  reporters: [reporterError, devReporter],
})
