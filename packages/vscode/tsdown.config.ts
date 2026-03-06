import { defineConfig } from 'tsdown'

export default defineConfig({
  external: ['vscode'],
  /// keep-sorted
  inlineOnly: [
    'before-after-hook',
    'bottleneck',
    'fast-content-type-parse',
    'jiti',
    'json-with-bigint',
    'pathe',
    'toad-cache',
    'universal-github-app-jwt',
    'universal-user-agent',
    'yaml',
    /octokit/,
    /reactive-vscode/,
  ],
  minify: 'dce-only',
})
