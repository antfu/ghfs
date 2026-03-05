import type { GhfsUserConfig } from './types'

export function defineConfig(config: GhfsUserConfig): GhfsUserConfig {
  return config
}

export {
  createRepositoryProvider,
} from './providers/factory'

export type {
  GhfsResolvedConfig,
  GhfsUserConfig,
  IssueKind,
  IssueState,
} from './types'

export type {
  PaginateItemsOptions,
  ProviderComment,
  ProviderItem,
  ProviderItemSnapshot,
  ProviderLockReason,
  ProviderPullMetadata,
  RepositoryProvider,
} from './types/provider'
