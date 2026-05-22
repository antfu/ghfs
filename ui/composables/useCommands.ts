import type { WhenNode } from 'whenexpr'
import { evaluate, parse } from 'whenexpr'

export interface KeybindingDef {
  /** Key chord or sequence (`'j'`, `'g g'`, `'mod+k'`, `'shift+Tab'`). */
  key: string
  /** Optional whenexpr that narrows command.when for this binding. */
  when?: string
  /** Display override; defaults to a humanized form of `key`. */
  label?: string[]
}

export interface Command {
  /** Stable namespaced id (e.g. `'item.close'`, `'palette.open'`). */
  id: string
  /** Palette label, also reused in `<PanelHelp>`. */
  title: string
  /** Group label for palette/help (`'Navigate'`, `'Item'`, ...). */
  category: string
  /** Longer help text (optional, surfaced in palette tooltip / help row). */
  description?: string
  /** Iconify class for palette row icon. */
  icon?: string
  /** whenexpr — gates palette visibility, keybinding firing, and Kbd fade. */
  when?: string
  /** Inline keybindings. String shorthand expands to `{ key }`. */
  keybindings?: Array<string | KeybindingDef>
  /**
   * Whether to surface in `<PanelHelp>`:
   * - `true` (default) — always show
   * - `false` — never show (palette-internal commands)
   * - `string` — whenexpr; show only when it evaluates true
   */
  help?: boolean | string
  run: () => void | Promise<void>
}

export interface ResolvedKeybinding {
  command: Command
  /** Original raw key string. */
  key: string
  /** Effective `when` (binding.when || command.when). */
  when?: string
  label?: string[]
}

interface CompiledCommand {
  command: Command
  whenNode: WhenNode | null
  helpNode: WhenNode | null
}

interface CompiledKeybinding {
  command: Command
  key: string
  /** Effective when (binding.when ?? command.when), parsed once. */
  whenNode: WhenNode | null
  label?: string[]
}

const compiled = shallowRef<CompiledCommand[]>([])
const keybindings = shallowRef<CompiledKeybinding[]>([])
const byId = new Map<string, CompiledCommand>()

function compile(expr: string | undefined): WhenNode | null {
  if (!expr) return null
  try {
    return parse(expr)
  }
  catch (err) {
    if (typeof console !== 'undefined')
      console.warn(`[commands] failed to parse when expression: ${expr}`, err)
    return null
  }
}

export function registerCommands(list: Command[]): void {
  byId.clear()
  const compiledList: CompiledCommand[] = []
  const bindings: CompiledKeybinding[] = []
  for (const cmd of list) {
    if (byId.has(cmd.id)) {
      if (typeof console !== 'undefined')
        console.warn(`[commands] duplicate command id: ${cmd.id}`)
      continue
    }
    const entry: CompiledCommand = {
      command: cmd,
      whenNode: compile(cmd.when),
      helpNode: typeof cmd.help === 'string' ? compile(cmd.help) : null,
    }
    compiledList.push(entry)
    byId.set(cmd.id, entry)
    if (cmd.keybindings) {
      for (const kb of cmd.keybindings) {
        const norm = typeof kb === 'string' ? { key: kb } : kb
        const effectiveWhen = norm.when ?? cmd.when
        bindings.push({
          command: cmd,
          key: norm.key,
          whenNode: compile(effectiveWhen),
          label: norm.label,
        })
      }
    }
  }
  compiled.value = compiledList
  keybindings.value = bindings
}

export function getAllCommands(): Command[] {
  return compiled.value.map(c => c.command)
}

export function getCommand(id: string): Command | undefined {
  return byId.get(id)?.command
}

export function getKeybindingsFor(id: string): ResolvedKeybinding[] {
  const out: ResolvedKeybinding[] = []
  for (const kb of keybindings.value) {
    if (kb.command.id !== id) continue
    out.push({
      command: kb.command,
      key: kb.key,
      when: typeof kb.command.when === 'string' ? kb.command.when : undefined,
      label: kb.label,
    })
  }
  return out
}

export function evalWhen(node: WhenNode | null, ctx: Record<string, unknown>): boolean {
  if (!node) return true
  try {
    return evaluate(node, ctx)
  }
  catch (err) {
    if (typeof console !== 'undefined')
      console.warn('[commands] when evaluation failed', err)
    return false
  }
}

export interface CompiledCommandRef {
  command: Command
  whenNode: WhenNode | null
  helpNode: WhenNode | null
}

export function getCompiledCommands(): CompiledCommandRef[] {
  return compiled.value
}

export function getCompiledKeybindings(): readonly CompiledKeybinding[] {
  return keybindings.value
}

export interface CommandBinding {
  command: ComputedRef<Command | undefined>
  /** Display tokens for the first keybinding (empty if none). */
  label: ComputedRef<string[]>
  /** Raw key string of the first keybinding. */
  key: ComputedRef<string>
  /** True when command.when passes (or no when). */
  active: ComputedRef<boolean>
  /** True when the command has at least one keybinding. */
  hasKey: ComputedRef<boolean>
}

/**
 * Reactive binding for inline `<UiKbd>` rendering. Returns the first
 * keybinding's label and whether the command is currently enabled.
 */
export function useCommand(id: string): CommandBinding {
  const ctx = useWhenContext()
  const command = computed(() => byId.get(id)?.command)
  const bindings = computed(() =>
    keybindings.value.filter(kb => kb.command.id === id),
  )
  const label = computed<string[]>(() => {
    const first = bindings.value[0]
    if (!first) return []
    if (first.label) return first.label
    return bindingDisplay(first.key)
  })
  const key = computed<string>(() => bindings.value[0]?.key ?? '')
  const hasKey = computed(() => bindings.value.length > 0)
  const active = computed(() => {
    const entry = byId.get(id)
    if (!entry) return false
    return evalWhen(entry.whenNode, ctx.value as unknown as Record<string, unknown>)
  })
  return { command, label, key, active, hasKey }
}
