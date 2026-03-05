# Rules

- CLI related logics, usage of `@clack/prompts`, `console.log` can only be under `src/cli/`
- GitHub related logics, usage of `octokit` can only be under `src/providers/github/`
- Pure/simple functions should better be under `src/utils/` and be tested alongside.
- Avoid duplicating logics, refactor them to reuse.
- Always use `pathe` instead of `node:path`
