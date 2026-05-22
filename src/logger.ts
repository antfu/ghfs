import type { Diagnostic } from 'nostics'
import { diagnostics } from './diagnostics'

export { diagnostics }

export function formatInline(d: Diagnostic): string {
  return `[${d.name}] ${d.message}`
}
