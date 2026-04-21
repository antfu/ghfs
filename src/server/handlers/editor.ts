import type { ServerContext } from '../context'
import { spawn } from 'node:child_process'
import process from 'node:process'
import { isAbsolute, resolve } from 'pathe'

export function createEditorHandler(ctx: ServerContext): (filePath: string) => Promise<void> {
  return async function openInEditor(filePath) {
    const absolute = isAbsolute(filePath) ? filePath : resolve(ctx.storageDirAbsolute, filePath)
    const editor = process.env.EDITOR || process.env.VISUAL || 'code'
    return new Promise<void>((resolvePromise, rejectPromise) => {
      const child = spawn(editor, [absolute], {
        stdio: 'ignore',
        detached: true,
      })
      child.on('error', rejectPromise)
      child.unref()
      resolvePromise()
    })
  }
}
