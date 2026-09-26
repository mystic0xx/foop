# Roadmap

Foop is early software. This page reflects the intended trajectory; features
move between milestones as the project evolves.

## V1 — Web UI

The first surface: the full lifecycle in the browser.

* Define — connect wallet, paste a contract, select a function, set args, value,
  and iterations.
* Simulate — balance checks, gas estimation, revert detection, executable count.
* Execute — nonce management, submission, receipt tracking, live progress.
* Observe — confirmed / failed / pending, total and average gas, explorer links.

## V1.5 — Reuse & history

* Saved workloads and workload history
* Multi-step workloads
* Reusable templates

## V2 — CLI & automation

The command-line surface documented throughout these docs (**in active
development**):

* `foop simulate`, `foop run`, `foop init`
* Version-controlled workload JSON files
* CI/CD integration (simulate as a gate — see the exit codes)
* Team sharing
* Agent-callable execution API

## Status legend

| Surface | State |
|---|---|
| Web UI (V1) | The primary shipped surface |
| CLI (V2) | In active development — commands and flags may change |

For what the CLI does today, see the [CLI Reference](cli/overview.md).
