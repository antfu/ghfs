import type { Diagnostic } from 'logs-sdk'
import { CodedError, consoleReporter, createLogger } from 'logs-sdk'
import { diagnostics } from './diagnostics'

export const log = createLogger({
  diagnostics: [diagnostics],
  reporters: [consoleReporter],
})

export { CodedError, diagnostics }

export function formatInline(d: Diagnostic): string {
  return `[${d.code}] ${d.message}`
}
