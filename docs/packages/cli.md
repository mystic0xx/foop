# @foop/cli

`@foop/cli` is the terminal interface to Foop. It's a thin layer over
[`@foop/core`](core.md): parse arguments, load config, call the planner or
executor, and render results.

## Structure

| File | Responsibility |
|---|---|
| `index.ts` | Entry point and command router (`simulate` / `run` / `init`). |
| `config.ts` | Load `FOOP_PRIVATE_KEY` / `FOOP_RPC_URL`; read and parse workload files. |
| `commands/simulate.ts` | `foop simulate` — plan and render, no signing. |
| `commands/run.ts` | `foop run` — plan, confirm, execute, summarize. |
| `commands/init.ts` | `foop init` — interactive scaffolder. |
| `renderer/progress.ts` | Terminal output: headers, tables, progress bar, status lines. |

## Command router

`index.ts` reads `argv`, dispatches to a lazily-imported command module, and
prints the usage banner for unknown or missing commands. Command modules are
imported on demand so startup stays fast.

```ts
switch (command) {
  case "simulate": /* → commands/simulate */
  case "run":      /* → commands/run */
  case "init":     /* → commands/init */
  default:         /* usage banner */
}
```

Top-level errors are caught, printed as `Error: <message>`, and exit **1**.

## Configuration

`config.ts` exposes `loadConfig()` (reads the two env vars) and
`readWorkloadFile(path)` (resolves, reads, and JSON-parses the file with clear
error messages). See [Configuration](../cli/configuration.md).

## Rendering

`renderer/progress.ts` centralizes all terminal output — the simulation table,
the mainnet and large-workload notices, the live progress bar, per-transaction
lines, and the final summary — so the command modules stay focused on flow.

## Build

The CLI bundles to a single file with a shebang via `tsup`
(`packages/cli/dist/index.js`), so it can be run directly with `node` or through
the workspace `pnpm foop` script.

## Related

* [CLI Overview](../cli/overview.md)
* [@foop/core](core.md)
