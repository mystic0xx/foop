# Safety & guardrails

Foop runs transactions in bulk, so its design centers on making the dangerous
parts hard to do by accident. This page collects every guardrail in one place.

## Non-custodial by design

Foop **never stores private keys**. The web UI signs through your browser
wallet; the CLI signs locally with a key you pass via `FOOP_PRIVATE_KEY`. Every
transaction is a normal, user-authorized interaction — Foop is a planner and
runner, not a custodian.

## Simulation always precedes execution

`foop run` **always** re-simulates before it submits anything. There is no way
to execute a workload that hasn't just been simulated. Simulation itself is
read-only and never signs.

## The executable count is a hard ceiling

The number of transactions Foop executes per step is
`min(requested, maxByGas, maxByValue, maxByToken)` — computed by the simulation
engine. Foop submits **exactly** that many and never more. It will **never run
until funds are exhausted**: your `repeat` count is an absolute upper bound, and
balance constraints only ever lower it.

## Explicit review

Before executing, `foop run` prints the plan and prompts
`Execute N transaction(s)? [y/N]`. You must type `y`. Automation can bypass the
prompt with `--yes` / `-y` — an explicit opt-out, not the default.

## Mainnet gate

Chains recognized as mainnet (Ethereum, Optimism, Base, Arbitrum, Polygon,
Avalanche, BNB Chain) require the `--mainnet-i-understand` flag. Without it,
`foop run` prints a warning and exits without submitting. `foop simulate` shows
an informational mainnet notice but is always safe to run.

## Repeat bounds

* `repeat` must be between **1** and **10,000**. Above 10,000 is a hard error —
  split the work into multiple files.
* `repeat` > **500** emits a warning (and a large-workload notice on the total)
  so a stray extra zero doesn't quietly become an expensive run.

## Zero-executable abort

If simulation finds that **no** transactions are executable, `foop run` aborts
before submitting anything. There's nothing safe to do, so it does nothing.

## Chain-mismatch protection

Before simulating, Foop checks that the RPC's chain ID equals the workload's
`chain`. A mismatch aborts — you can't accidentally run a Base workload against
a Polygon endpoint.

## Precise math

All balance, fee, and value arithmetic uses **BigInt** — no JavaScript floats.
`value` and numeric `args` are strings in the workload file to preserve
`uint256` precision.

## Your responsibilities

* Use a **dedicated key** with only test funds while experimenting.
* Keep `FOOP_PRIVATE_KEY` out of shell history, logs, and version control.
* **Read the simulation** before confirming — especially the `blockedBy` and any
  revert reasons.
* Treat `--yes` and `--mainnet-i-understand` as deliberate, reviewed choices.
