import type { CAC } from 'cac'
import { getStorageDirAbsolute, resolveConfig } from '../../config/load'
import { writeExecuteSchema } from '../../execute/schema'
import { withErrorHandling } from '../errors'
import { printSchemaPath } from '../output'

export function registerSchemaCommand(cli: CAC): void {
  cli
    .command('schema', 'Write execute schema to .ghfs/schema/execute.schema.json')
    .action(withErrorHandling(async () => {
      const config = await resolveConfig()
      const schemaPath = await writeExecuteSchema(getStorageDirAbsolute(config))
      printSchemaPath(schemaPath)
    }))
}
