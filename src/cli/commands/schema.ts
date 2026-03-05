import type { CAC } from 'cac'
import { getStorageDirAbsolute, resolveConfig } from '../../config'
import { writeExecuteSchema } from '../../execute/schema'
import { withErrorHandling } from '../errors'
import { createCliPrinter } from '../printer'

export function registerSchemaCommand(cli: CAC): void {
  cli
    .command('schema', 'Write execute schema to .ghfs/schema/execute.schema.json')
    .action(withErrorHandling(async () => {
      const printer = createCliPrinter('schema')
      printer.start('Writing execute schema')
      const config = await resolveConfig()
      const schemaPath = await writeExecuteSchema(getStorageDirAbsolute(config))
      printer.done(`Schema written to ${schemaPath}`)
    }))
}
