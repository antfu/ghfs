import type { DevframeDefinition } from 'devframe/types'
import { defineDevframe } from 'devframe/types'
import { join } from 'pathe'
import { distDir } from '../dir'
import { setupHubMode } from './hub-mode'
import { setupUiMode } from './ui-mode'

/**
 * Flags expected by the devframe `setup()` callback. Both the `ghfs ui`
 * and `ghfs hub` CLI commands forward their resolved options through
 * `createDevServer({ flags })`. The shape carries already-resolved
 * runtime values (config object, token, repo, etc.) so `setup()` does
 * not need to repeat the resolution logic.
 */
export interface GhfsDevframeFlags extends Record<string, unknown> {
  mode: 'ui' | 'hub'
  /** Used in both modes to render banners and to derive defaults. */
  cwd: string
  /** ui-mode: pre-resolved config & repo & token. */
  uiOptions?: import('./ui-mode').UiModeOptions
  /** hub-mode: pre-resolved entries + scanner output. */
  hubOptions?: import('./hub-mode').HubModeOptions
}

// Module-level handle so `createDevServer.close()` can chain cleanup.
let activeClose: (() => Promise<void>) | undefined

export const ghfsDevframe: DevframeDefinition = defineDevframe({
  id: 'ghfs',
  name: 'ghfs',
  icon: 'octicon:mark-github-16',
  basePath: '/',
  cli: {
    command: 'ghfs',
    port: 7710,
    host: '127.0.0.1',
    distDir: join(distDir, 'ui'),
    // Single-user localhost tool — skip the RPC trust handshake.
    auth: false,
  },
  spa: { loader: 'none' },
  async setup(ctx, info) {
    const flags = (info?.flags ?? {}) as unknown as GhfsDevframeFlags
    if (flags.mode === 'hub') {
      if (!flags.hubOptions)
        throw new Error('ghfs hub: hubOptions missing from devframe flags')
      const handle = await setupHubMode(ctx, flags.hubOptions)
      activeClose = handle.close
      return
    }
    if (!flags.uiOptions)
      throw new Error('ghfs ui: uiOptions missing from devframe flags')
    const handle = await setupUiMode(ctx, flags.uiOptions)
    activeClose = handle.close
  },
})

export async function closeActiveGhfs(): Promise<void> {
  if (activeClose) {
    const close = activeClose
    activeClose = undefined
    await close()
  }
}
