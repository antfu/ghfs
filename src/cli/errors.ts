import process from 'node:process'
import { createCliPrinter } from './printer'

export function withErrorHandling<TArgs extends unknown[]>(fn: (...args: TArgs) => Promise<void>): (...args: TArgs) => void {
  return (...args: TArgs) => {
    fn(...args).catch((error) => {
      const message = (error as Error).message || String(error)
      createCliPrinter('error').error(`ghfs error: ${message}`)
      process.exit(1)
    })
  }
}
