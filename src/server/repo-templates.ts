import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'pathe'
import { parse, stringify } from 'yaml'

export interface RepoTemplate {
  title: string
  body: string
}

export interface RepoTemplatesCache {
  /** Templates parsed from `.github/replies.yml`. Empty when the file is missing. */
  templates: RepoTemplate[]
  /** Non-fatal warnings (parse issues, dropped entries). */
  warnings: string[]
  /** File mtime in ms, or null when the file doesn't exist. */
  mtimeMs: number | null
  /** Absolute path to the source file. */
  sourcePath: string
}

const MAX_TITLE_LENGTH = 200
const MAX_BODY_LENGTH = 10_000
const MAX_TEMPLATES = 200
const REPO_TEMPLATES_FILE = join('.github', 'replies.yml')
const CACHE_FILE = 'repo-templates.json'

function templatesPath(projectPath: string): string {
  return join(projectPath, REPO_TEMPLATES_FILE)
}

function cachePath(storageDirAbsolute: string): string {
  return join(storageDirAbsolute, CACHE_FILE)
}

export function parseRepoTemplatesYaml(raw: string): { templates: RepoTemplate[], warnings: string[] } {
  const warnings: string[] = []
  const trimmed = raw.trim()
  if (!trimmed)
    return { templates: [], warnings }

  let parsed: unknown
  try {
    parsed = parse(raw)
  }
  catch (err) {
    warnings.push(`Failed to parse YAML: ${(err as Error).message}`)
    return { templates: [], warnings }
  }

  // refined-saved-replies uses a top-level list. Also tolerate `{ replies: [...] }`.
  let list: unknown[] | null = null
  if (Array.isArray(parsed))
    list = parsed
  else if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { replies?: unknown }).replies))
    list = (parsed as { replies: unknown[] }).replies

  if (!list) {
    warnings.push('Expected a YAML list at the top level (or a `replies:` key).')
    return { templates: [], warnings }
  }

  const templates: RepoTemplate[] = []
  for (let i = 0; i < list.length; i += 1) {
    const entry = list[i]
    if (!entry || typeof entry !== 'object') {
      warnings.push(`Entry #${i + 1}: not an object, skipped.`)
      continue
    }
    const rec = entry as { title?: unknown, body?: unknown }
    const title = typeof rec.title === 'string' ? rec.title.trim() : ''
    const body = typeof rec.body === 'string' ? rec.body : ''
    if (!title) {
      warnings.push(`Entry #${i + 1}: missing or empty \`title\`, skipped.`)
      continue
    }
    if (!body) {
      warnings.push(`Entry #${i + 1}: missing or empty \`body\`, skipped.`)
      continue
    }
    if (title.length > MAX_TITLE_LENGTH) {
      warnings.push(`Entry #${i + 1}: title exceeds ${MAX_TITLE_LENGTH} chars, truncated.`)
    }
    if (body.length > MAX_BODY_LENGTH) {
      warnings.push(`Entry #${i + 1}: body exceeds ${MAX_BODY_LENGTH} chars, truncated.`)
    }
    templates.push({
      title: title.slice(0, MAX_TITLE_LENGTH),
      body: body.slice(0, MAX_BODY_LENGTH),
    })
    if (templates.length >= MAX_TEMPLATES) {
      if (i + 1 < list.length)
        warnings.push(`Only the first ${MAX_TEMPLATES} entries are kept.`)
      break
    }
  }
  return { templates, warnings }
}

export function serializeRepoTemplatesYaml(templates: RepoTemplate[]): string {
  // `stringify` auto-picks block scalar style for multi-line strings.
  return stringify(templates.map(t => ({ title: t.title, body: t.body })))
}

export async function loadRepoTemplates(
  projectPath: string,
  storageDirAbsolute: string,
): Promise<RepoTemplatesCache> {
  const sourcePath = templatesPath(projectPath)
  let mtimeMs: number | null = null
  try {
    const s = await stat(sourcePath)
    mtimeMs = s.mtimeMs
  }
  catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { templates: [], warnings: [], mtimeMs: null, sourcePath }
    }
    throw err
  }

  // Try the mtime-keyed cache first.
  try {
    const cached = JSON.parse(await readFile(cachePath(storageDirAbsolute), 'utf8')) as Partial<RepoTemplatesCache>
    if (cached && cached.mtimeMs === mtimeMs && Array.isArray(cached.templates)) {
      return {
        templates: cached.templates,
        warnings: cached.warnings ?? [],
        mtimeMs,
        sourcePath,
      }
    }
  }
  catch {
    // cache miss — fall through to re-parse.
  }

  const raw = await readFile(sourcePath, 'utf8')
  const { templates, warnings } = parseRepoTemplatesYaml(raw)
  const cache: RepoTemplatesCache = { templates, warnings, mtimeMs, sourcePath }
  await writeCache(storageDirAbsolute, cache)
  return cache
}

export async function saveRepoTemplates(
  projectPath: string,
  storageDirAbsolute: string,
  templates: RepoTemplate[],
): Promise<RepoTemplatesCache> {
  const sourcePath = templatesPath(projectPath)
  const sanitized = templates
    .map(t => ({ title: t.title.trim().slice(0, MAX_TITLE_LENGTH), body: t.body.slice(0, MAX_BODY_LENGTH) }))
    .filter(t => t.title.length > 0 && t.body.length > 0)
    .slice(0, MAX_TEMPLATES)
  const yaml = sanitized.length > 0 ? serializeRepoTemplatesYaml(sanitized) : ''
  await mkdir(dirname(sourcePath), { recursive: true })
  await writeFile(sourcePath, yaml, 'utf8')
  const s = await stat(sourcePath)
  const cache: RepoTemplatesCache = {
    templates: sanitized,
    warnings: [],
    mtimeMs: s.mtimeMs,
    sourcePath,
  }
  await writeCache(storageDirAbsolute, cache)
  return cache
}

async function writeCache(storageDirAbsolute: string, cache: RepoTemplatesCache): Promise<void> {
  try {
    await mkdir(storageDirAbsolute, { recursive: true })
    await writeFile(cachePath(storageDirAbsolute), `${JSON.stringify(cache, null, 2)}\n`, 'utf8')
  }
  catch {
    // Cache is opportunistic; ignore failures (e.g. read-only fs in tests).
  }
}
