export interface GhfsUserConfig {
  /**
   * The repository to sync.
   *
   * Will try to detect the repository from the current working directory or the `package.json` file.
   */
  repo?: string
  /**
   * The directory to store the synced issues and pull requests.
   *
   * @default '.ghfs'
   */
  directory?: string
  /**
   * The authentication configuration.
   */
  auth?: {
    /**
     * The GitHub personal access token to use for authentication.
     *
     * When not provided, will try to get the token from `gh auth token` or the environment variables `GH_TOKEN` or `GITHUB_TOKEN`.
     */
    token?: string
  }
  /**
   * Additional bot logins to ignore when computing the "last updated"
   * sort order for issues and pull requests. Logins ending with `[bot]`
   * (e.g. `dependabot[bot]`) are always detected automatically; use this
   * list for non-suffix bots like `coderabbitai`. Case-insensitive.
   *
   * @default []
   */
  bots?: string[]
  sync?: {
    /**
     * Whether to sync issues.
     *
     * @default true
     */
    issues?: boolean
    /**
     * Whether to sync pull requests.
     *
     * @default true
     */
    pulls?: boolean
    /**
     * When to sync closed issues and pull requests.
     *
     * - `true`: sync all closed issues and pull requests.
     * - `false`: don't sync any closed issues and pull requests. And delete any existing closed issues and pull requests from the local filesystem.
     *
     * @default false
     */
    closed?: boolean
    /**
     * When to download the pull request patch files.
     *
     * - `'open'`: only download open pull request patch files.
     * - `'all'`: download all pull request patch files.
     * - `false`: don't download any pull request patch files.
     *
     * @default 'open'
     */
    patches?: 'open' | 'all' | false
  }
  /**
   * Model-assisted triage through Vercel AI Gateway. Models only ever
   * propose queue operations; nothing reaches GitHub until the queue is executed.
   */
  ai?: {
    /**
     * Vercel AI Gateway API key.
     *
     * When not provided, falls back to the `AI_GATEWAY_API_KEY` environment variable.
     */
    apiKey?: string
    /**
     * Decision model that scores every label; a Gateway classifier id.
     *
     * @default 'typesafe-ai/jev'
     */
    model?: string
    /**
     * Chat model for the tool-using agent that gathers more context when the
     * decision model is unsure; a Gateway chat model id.
     *
     * @default 'anthropic/claude-haiku-4.5'
     */
    agentModel?: string
    labeling?: {
      /**
       * Minimum probability for a label to be suggested.
       *
       * @default 0.7
       */
      threshold?: number
      /**
       * How many already-labeled items are shown to the model as examples per label.
       *
       * @default 3
       */
      examplesPerLabel?: number
      /** Free-text labeling guidelines appended to every label question. */
      guidelines?: string
      /** Labels never suggested (e.g. `good first issue`). */
      exclude?: string[]
    }
  }
}

/** Values from `ghfs.config.ts` only; `resolveAiSettings` layers the UI-saved credentials, environment, and defaults on top. */
export interface GhfsResolvedAiConfig {
  apiKey: string
  model?: string
  agentModel?: string
  labeling: {
    threshold: number
    examplesPerLabel: number
    guidelines: string
    exclude: string[]
  }
}

export type GhfsResolvedConfig = Required<Omit<GhfsUserConfig, 'ai'>> & {
  cwd: string
  auth: Required<GhfsUserConfig['auth']>
  sync: Required<GhfsUserConfig['sync']>
  ai: GhfsResolvedAiConfig
}
