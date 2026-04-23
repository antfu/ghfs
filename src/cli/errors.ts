import process from 'node:process'
import c from 'ansis'
import { CodedError } from '../logger'

export function withErrorHandling<TArgs extends unknown[]>(fn: (...args: TArgs) => Promise<void>): (...args: TArgs) => void {
  return (...args: TArgs) => {
    fn(...args).catch((error) => {
      if (error instanceof CodedError) {
        const d = error.diagnostic
        console.error(c.red(`[${d.code}] ${d.message}`))
        if (d.fix)
          console.error(c.dim(`  fix: ${d.fix}`))
        if (d.docs)
          console.error(c.dim(`  see: ${d.docs}`))
      }
      else {
        console.error(error)
      }
      process.exit(1)
    })
  }
}
