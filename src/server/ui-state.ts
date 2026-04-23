import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'pathe'

export const UI_STATE_FILE = '.ui.json'

export type PrTabId = 'conversation' | 'commits' | 'changes'

export interface UiState {
  /** Map of issue number (string) → pending comment draft body. */
  drafts: Record<string, string>
  /** Size (in percent) of the list pane in the Splitpanes layout. */
  listPaneSize?: number
  /** Last tab selected on the PR detail panel. */
  lastPrTab?: PrTabId
}

export function createEmptyUiState(): UiState {
  return { drafts: {} }
}

function normalizePrTab(value: unknown): PrTabId | undefined {
  if (value === 'conversation' || value === 'commits' || value === 'changes')
    return value
  return undefined
}

export async function loadUiState(storageDirAbsolute: string): Promise<UiState> {
  try {
    const raw = await readFile(join(storageDirAbsolute, UI_STATE_FILE), 'utf8')
    const parsed = JSON.parse(raw) as Partial<UiState>
    const drafts: Record<string, string> = {}
    if (parsed.drafts && typeof parsed.drafts === 'object') {
      for (const [key, value] of Object.entries(parsed.drafts)) {
        if (typeof value === 'string' && value.length > 0)
          drafts[key] = value
      }
    }
    return {
      drafts,
      listPaneSize: typeof parsed.listPaneSize === 'number' ? parsed.listPaneSize : undefined,
      lastPrTab: normalizePrTab(parsed.lastPrTab),
    }
  }
  catch {
    return createEmptyUiState()
  }
}

export async function saveUiState(storageDirAbsolute: string, state: UiState): Promise<void> {
  await mkdir(storageDirAbsolute, { recursive: true })
  const tab = normalizePrTab(state.lastPrTab)
  const clean: UiState = {
    drafts: { ...state.drafts },
    ...(state.listPaneSize != null ? { listPaneSize: state.listPaneSize } : {}),
    ...(tab ? { lastPrTab: tab } : {}),
  }
  await writeFile(
    join(storageDirAbsolute, UI_STATE_FILE),
    `${JSON.stringify(clean, null, 2)}\n`,
    'utf8',
  )
}
