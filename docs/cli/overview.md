# CLI Overview

The Foop CLI exposes the workload lifecycle, plus reusable storage, history, and
templates.

```
foop — on-chain workload runner

Usage:
  foop                             Interactive launcher (AI / provide / scaffold)
  foop ai [prompt]                 Build a workload from plain English
  foop simulate <workload|name>    Dry-run a workload (no signing)
  foop run <workload|name>         Simulate then execute
  foop init                        Scaffold a workload file

Saved workloads & history:
  foop save <file.json> [name]     Save a workload to ~/.foop
  foop list                        List saved workloads
  foop show <name>                 Print a saved workload
  foop rm <name>                   Delete a saved workload
  foop history [name]              Show past run history

Templates:
  foop templates                   List available templates
  foop new <template> [name]       Create a workload from a template

Environment:
  FOOP_PRIVATE_KEY   Private key for signing (run only)
  FOOP_RPC_URL       RPC endpoint override
  ETHERSCAN_API_KEY  Enables the Etherscan ABI lookup tier
  FOOP_HOME          Store location (default ~/.foop)
  ANTHROPIC_API_KEY  API key for `foop ai`
  FOOP_AI_MODEL      Model for `foop ai` (default claude-sonnet-5)
```

## Launcher

Running `foop` with no command opens an interactive launcher with three ways to
start a workload:

| Choice | Goes to |
|---|---|
| **Use foop AI** | [`foop ai`](foop-ai.md) — describe it in plain English. |
| **Provide a workload** | Bring your own populated JSON, then simulate or run it. |
| **Scaffold a workload** | [`foop init`](foop-init.md) — the guided step-by-step builder. |

The launcher needs an interactive terminal; in a non-TTY context (piped or CI) it
prints a hint pointing at the commands instead.

## Commands

### Lifecycle

| Command | Purpose | Signs? |
|---|---|---|
| [`foop ai`](foop-ai.md) | Build a workload from plain English, then simulate and (on approval) run it. | Optional |
| [`foop init`](foop-init.md) | Interactively scaffold a `workload.json` file. | No |
| [`foop simulate`](foop-simulate.md) | Validate and simulate a workload; report the executable count. | No |
| [`foop run`](foop-run.md) | Simulate, prompt for approval, then execute and report. | Yes |

### Saved workloads & history

| Command | Purpose |
|---|---|
| `foop save <file.json> [name]` | Copy a workload file into the store (`--as-template` to save as a template instead). |
| `foop list` | List saved workloads. |
| `foop show <name>` | Print a saved workload's JSON. |
| `foop rm <name>` | Delete a saved workload (`--yes` to skip the prompt). |
| `foop history [name]` | Show past `foop run` history (`--json`, `--limit N`, or filter by name). |

Anywhere a command takes `<workload>`, you can pass either a **file path** or a
**saved name** — an existing file path wins, otherwise the store is searched.

### Templates

| Command | Purpose |
|---|---|
| `foop templates` | List bundled and user templates. |
| `foop new <template> [name]` | Instantiate a template into a saved workload. |

Bundled starters include `wrap-eth`, `unwrap-eth`, `erc20-approve`,
`erc20-transfer`, and `uniswap-swap`. A user template with the same name shadows
a bundled one.

## Typical flow

```bash
foop init                       # create workload.json
foop simulate workload.json     # dry-run, check the plan
foop run workload.json          # approve and execute
foop history                    # review past runs
```

## Invocation

Until a global binary is published, run the CLI through the workspace:

```bash
pnpm foop <command> [...args]
# or
node packages/cli/dist/index.js <command> [...args]
```

Running `foop` with no command (or an unknown one) prints the usage banner. An
unknown command exits **1**; a bare `foop` exits **0**.

## Configuration

All configuration is via environment variables — see
[Configuration](configuration.md). The most important are `FOOP_RPC_URL`
(endpoint) and `FOOP_PRIVATE_KEY` (signing, `run` only). `FOOP_HOME` relocates
the store; `ETHERSCAN_API_KEY` widens ABI resolution.
