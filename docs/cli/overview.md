# CLI Overview

The Foop CLI exposes the workload lifecycle through three commands.

```
foop — on-chain workload runner

Usage:
  foop simulate <workload.json>   Dry-run a workload (no signing)
  foop run <workload.json>        Simulate then execute
  foop init                       Scaffold a workload file

Environment:
  FOOP_PRIVATE_KEY   Private key for signing (run only)
  FOOP_RPC_URL       RPC endpoint override
```

## Commands

| Command | Purpose | Signs? |
|---|---|---|
| [`foop init`](foop-init.md) | Interactively scaffold a `workload.json` file. | No |
| [`foop simulate`](foop-simulate.md) | Validate and simulate a workload; report the executable count. | No |
| [`foop run`](foop-run.md) | Simulate, prompt for approval, then execute and report. | Yes |

## Typical flow

```bash
foop init                       # create workload.json
foop simulate workload.json     # dry-run, check the plan
foop run workload.json          # approve and execute
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
(endpoint) and `FOOP_PRIVATE_KEY` (signing, `run` only).
