import { defineConfig } from 'tsdown'

export default defineConfig({
  external: ['vscode'],
  /// keep-sorted
  inlineOnly: [
    '@reactive-vscode/reactivity',
    'reactive-vscode',
  ],
  minify: 'dce-only',
})
