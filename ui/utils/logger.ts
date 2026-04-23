import { CodedError, consoleReporter, createLogger } from 'logs-sdk'
import { devReporter } from 'logs-sdk/reporters/dev'
import { diagnostics } from './diagnostics'

export const log = createLogger({
  diagnostics: [diagnostics],
  reporters: [consoleReporter, devReporter],
})

export { CodedError }
