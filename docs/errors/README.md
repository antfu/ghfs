# ghfs error codes

Every diagnostic `ghfs` emits has a stable code and a `see:` link that points to one of the pages listed below. Codes are structured as `GHFS<NNNN>`; the four-digit number groups codes into ranges by domain (auth, execute, sync, …) and separates errors from warnings within each range. The exact severity is always carried by the `Level:` field on the code's page.

## Auth (0001–0009)

| Code | Level | Summary |
| --- | --- | --- |
| [GHFS0001](./ghfs0001.md) | error | Missing GitHub token |
| [GHFS0002](./ghfs0002.md) | error | Token prompt cancelled |

## Repo resolution (0010–0019)

| Code | Level | Summary |
| --- | --- | --- |
| [GHFS0010](./ghfs0010.md) | error | Invalid `--repo` value |
| [GHFS0011](./ghfs0011.md) | error | Invalid repo in `ghfs.config.ts` |
| [GHFS0012](./ghfs0012.md) | error | Repository selection cancelled |
| [GHFS0013](./ghfs0013.md) | error | Invalid repository selection |
| [GHFS0014](./ghfs0014.md) | error | Repo mismatch detected |
| [GHFS0015](./ghfs0015.md) | error | Could not resolve repository |
| [GHFS0016](./ghfs0016.md) | error | Invalid repo slug |

## Execute (0100–0149)

| Code | Level | Summary |
| --- | --- | --- |
| [GHFS0100](./ghfs0100.md) | error | Interactive execute prompts are unavailable |
| [GHFS0101](./ghfs0101.md) | error | Operation conflict — remote was updated |
| [GHFS0102](./ghfs0102.md) | error | Execution cancelled |
| [GHFS0103](./ghfs0103.md) | error | Unsupported action |
| [GHFS0104](./ghfs0104.md) | error | Action requires a pull request target |
| [GHFS0105](./ghfs0105.md) | error | Failed to parse execute YAML |
| [GHFS0106](./ghfs0106.md) | error | Invalid execute file — wrong shape |
| [GHFS0107](./ghfs0107.md) | error | Invalid execute file — unknown action |
| [GHFS0108](./ghfs0108.md) | error | Invalid execute file — rule violations |

## Execute parser warnings (0150–0169)

| Code | Level | Summary |
| --- | --- | --- |
| [GHFS0150](./ghfs0150.md) | warn | Invalid quoted string syntax |
| [GHFS0151](./ghfs0151.md) | warn | Unrecognized action pattern |
| [GHFS0152](./ghfs0152.md) | warn | Action did not match its expected syntax |
| [GHFS0153](./ghfs0153.md) | warn | Action expects a single issue reference |
| [GHFS0154](./ghfs0154.md) | warn | Action requires at least one label |
| [GHFS0155](./ghfs0155.md) | warn | Action requires at least one assignee |
| [GHFS0156](./ghfs0156.md) | warn | Action requires a non-empty comment |
| [GHFS0157](./ghfs0157.md) | warn | Action expects one or more issue references |
| [GHFS0160](./ghfs0160.md) | warn | Per-item edit missing markdown file |
| [GHFS0161](./ghfs0161.md) | warn | Per-item edit has invalid or missing frontmatter |

## Server / queue (0200–0249)

| Code | Level | Summary |
| --- | --- | --- |
| [GHFS0200](./ghfs0200.md) | error | A sync is already in progress |
| [GHFS0201](./ghfs0201.md) | error | An execute is already in progress |
| [GHFS0202](./ghfs0202.md) | error | Queue entry not found |
| [GHFS0203](./ghfs0203.md) | error | Cannot remove a per-item edit from the queue |
| [GHFS0204](./ghfs0204.md) | error | `execute.md` not found |
| [GHFS0205](./ghfs0205.md) | error | Cannot edit this op source from the queue panel |
| [GHFS0206](./ghfs0206.md) | error | Queue operation failed |

## Provider (0300–0349)

| Code | Level | Summary |
| --- | --- | --- |
| [GHFS0300](./ghfs0300.md) | error | Unexpected patch response for pull request |
| [GHFS0301](./ghfs0301.md) | error | Milestone not found |

## Sync (0400–0449)

| Code | Level | Summary |
| --- | --- | --- |
| [GHFS0400](./ghfs0400.md) | error | Sync context was not initialized |
| [GHFS0401](./ghfs0401.md) | error | Missing tracked canonical data for issue/PR |
