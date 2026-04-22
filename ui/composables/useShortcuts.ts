export interface Shortcut {
  id: string
  /** Sequence of key values that must be pressed in order to trigger. Uses KeyboardEvent.key (e.g. 'j', 'G', '/', 'Escape'). */
  keys: string[]
  /** Display override for each key. Falls back to a humanized form of `keys`. */
  label?: string[]
  description: string
  /** Returns true when the shortcut can fire (and should render un-faded). */
  enabled?: () => boolean
  run: () => void | Promise<void>
}

const shortcuts = shallowRef<Shortcut[]>([])

export function installShortcuts(defs: Shortcut[]): void {
  shortcuts.value = defs
}

export function useShortcutsHandler(): void {
  if (typeof document === 'undefined')
    return

  const buffer: string[] = []
  let bufferTimer: ReturnType<typeof setTimeout> | null = null

  useEventListener(document, 'keydown', (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null
    const isInput = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)

    if (event.key === 'Escape' && isInput) {
      target.blur()
      return
    }
    if (isInput)
      return
    if (event.metaKey || event.ctrlKey || event.altKey)
      return

    const key = event.key
    if (!key)
      return

    buffer.push(key)
    if (buffer.length > 8)
      buffer.shift()
    if (bufferTimer)
      clearTimeout(bufferTimer)
    bufferTimer = setTimeout(() => { buffer.length = 0 }, 800)

    const sorted = [...shortcuts.value].sort((a, b) => b.keys.length - a.keys.length)
    for (const sc of sorted) {
      if (!tailMatches(buffer, sc.keys))
        continue
      if (sc.enabled && !sc.enabled())
        continue
      event.preventDefault()
      buffer.length = 0
      try {
        const result = sc.run()
        if (result && typeof result === 'object' && 'catch' in result)
          void (result as Promise<unknown>).catch((err: unknown) => {
            console.error('[shortcut]', sc.id, err)
          })
      }
      catch (err) {
        console.error('[shortcut]', sc.id, err)
      }
      return
    }
  })
}

function tailMatches(buffer: string[], keys: string[]): boolean {
  if (keys.length > buffer.length)
    return false
  const start = buffer.length - keys.length
  for (let i = 0; i < keys.length; i += 1) {
    if (buffer[start + i] !== keys[i])
      return false
  }
  return true
}

export interface ShortcutBinding {
  shortcut: ComputedRef<Shortcut | undefined>
  label: ComputedRef<string[]>
  active: ComputedRef<boolean>
}

export function useShortcut(id: string): ShortcutBinding {
  const shortcut = computed(() => shortcuts.value.find(s => s.id === id))
  const label = computed(() => {
    const s = shortcut.value
    if (!s)
      return []
    return s.label ?? s.keys.map(humanizeKey)
  })
  const active = computed(() => {
    const s = shortcut.value
    if (!s)
      return false
    return s.enabled ? !!s.enabled() : true
  })
  return { shortcut, label, active }
}

export function getAllShortcuts(): Shortcut[] {
  return shortcuts.value
}

function humanizeKey(key: string): string {
  if (key === 'Escape') return 'Esc'
  if (key === 'Enter') return '↵'
  if (key === 'ArrowUp') return '↑'
  if (key === 'ArrowDown') return '↓'
  if (key === ' ') return 'Space'
  return key
}
