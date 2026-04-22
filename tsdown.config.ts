import { access, cp, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'pathe'
import { defineConfig } from 'tsdown'

const here = dirname(fileURLToPath(import.meta.url))

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  }
  catch {
    return false
  }
}

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/cli.ts',
    'src/server/index.ts',
  ],
  format: ['esm'],
  dts: true,
  exports: true,
  async onSuccess() {
    const source = resolve(here, 'ui/dist/public')
    const target = resolve(here, 'dist/ui')
    if (!await pathExists(source))
      return
    await rm(target, { recursive: true, force: true })
    await cp(source, target, { recursive: true })
  },
})
