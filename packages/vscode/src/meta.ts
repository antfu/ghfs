import type { NestedScopedConfigs } from './generated-meta'
import { defineConfig, defineLogger } from 'reactive-vscode'
import { displayName, scopedConfigs } from './generated-meta'

export const config = defineConfig<NestedScopedConfigs>(scopedConfigs.scope)

export const logger = defineLogger(displayName)
