import process from 'node:process'
import c from 'ansis'
import { Diagnostic } from 'nostics'

export function withErrorHandling<TArgs extends unknown[]>(fn: (...args: TArgs) => Promise<void>): (...args: TArgs) => void {
  return (...args: TArgs) => {
    fn(...args).catch((error) => {
      if (error instanceof Diagnostic) {
        console.error(c.red(`[${error.name}] ${error.message}`))
        if (error.fix)
          console.error(c.dim(`  fix: ${error.fix}`))
        if (error.docs)
          console.error(c.dim(`  see: ${error.docs}`))
      }
      else {
        console.error(error)
      }
      process.exit(1)
    })
  }
}
