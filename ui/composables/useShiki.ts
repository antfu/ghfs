import type { HighlighterGeneric } from 'shiki'

type Highlighter = HighlighterGeneric<string, string>

const LANGS = [
  'bash',
  'shell',
  'diff',
  'json',
  'yaml',
  'toml',
  'html',
  'css',
  'scss',
  'vue',
  'javascript',
  'typescript',
  'tsx',
  'jsx',
  'python',
  'rust',
  'go',
  'ruby',
  'java',
  'kotlin',
  'markdown',
  'sql',
] as const

let highlighter: Highlighter | null = null
let loadPromise: Promise<Highlighter> | null = null
const version = ref(0)

export { version as shikiVersion }

export function getHighlighter(): Highlighter | null {
  return highlighter
}

export async function loadShiki(): Promise<Highlighter> {
  if (highlighter)
    return highlighter
  if (loadPromise)
    return loadPromise
  loadPromise = (async () => {
    const { createHighlighter } = await import('shiki')
    const hl = (await createHighlighter({
      themes: ['github-light', 'github-dark'],
      langs: [...LANGS],
    })) as Highlighter
    highlighter = hl
    version.value += 1
    return hl
  })()
  return loadPromise
}

export function useShiki(): void {
  if (typeof window !== 'undefined')
    void loadShiki()
}
