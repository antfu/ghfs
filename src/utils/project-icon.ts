import { readFile, stat } from 'node:fs/promises'
import { join } from 'pathe'

/**
 * Directories scanned for a project icon, in priority order. Earlier
 * directories win. Within a directory we try every (name, extension)
 * combination using {@link ICON_NAMES} × {@link ICON_EXTS}.
 */
const ICON_DIRS = ['public', 'docs', 'docs/public', 'res', '.github', 'assets', ''] as const
const ICON_NAMES = ['logo', 'icon', 'favicon'] as const
/** SVG first (scalable, tiny), then raster formats. ICO last (fallback). */
const ICON_EXTS = ['.svg', '.png', '.webp', '.jpg', '.jpeg', '.ico'] as const
const ICON_MAX_BYTES = 256 * 1024

const MIME_BY_EXT: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
}

/**
 * Returns a `data:` URL for the project icon found under `projectPath`, or
 * `null` if no recognised icon exists. Walks a fixed priority list of
 * candidate directories and (name, extension) combinations.
 */
export async function findProjectIcon(projectPath: string): Promise<string | null> {
  for (const dir of ICON_DIRS) {
    for (const name of ICON_NAMES) {
      for (const ext of ICON_EXTS) {
        const candidate = join(projectPath, dir, `${name}${ext}`)
        try {
          const info = await stat(candidate)
          if (!info.isFile() || info.size > ICON_MAX_BYTES)
            continue
          const buf = await readFile(candidate)
          const mime = MIME_BY_EXT[ext] ?? 'application/octet-stream'
          if (ext === '.svg') {
            // Inline SVG as utf8 — smaller than base64 and renders identically.
            return `data:${mime};utf8,${encodeURIComponent(buf.toString('utf8'))}`
          }
          return `data:${mime};base64,${buf.toString('base64')}`
        }
        catch {
          // ENOENT or unreadable — try the next candidate.
        }
      }
    }
  }
  return null
}
