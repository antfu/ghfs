import { cp, mkdir, rm, stat } from 'node:fs/promises'
import process from 'node:process'
import { resolve } from 'pathe'

async function copyUiBuildOutput() {
  const root = process.cwd()
  const from = resolve(root, 'ui/.output/public')
  const to = resolve(root, 'dist/ui')

  await stat(from)
  await rm(to, { recursive: true, force: true })
  await mkdir(resolve(root, 'dist'), { recursive: true })
  await cp(from, to, { recursive: true })
}

await copyUiBuildOutput()
