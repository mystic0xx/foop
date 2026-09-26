# 3. Execute

Execution submits the transactions the simulation deemed executable. It requires
a signing key and only proceeds after you approve the plan.

```bash
foop run workload.json
```

## What `foop run` does

1. **Requires `FOOP_PRIVATE_KEY`** — the CLI signs locally with this key.
2. **Gates mainnet** — if the workload targets a mainnet chain, it refuses to
   run without the explicit `--mainnet-i-understand` flag.
3. **Re-simulates** the workload (Simulate always runs before Execute).
4. **Shows the plan** and **prompts for confirmation** — unless you pass
   `--yes` / `-y`.
5. **Executes** the executable count per step, sequentially.
6. **Observes** — prints live progress and a final summary.

If the total executable count is **0**, `foop run` aborts before submitting
anything.

## Sequential submission

Foop submits **one transaction at a time**, waiting for each receipt before
sending the next. This keeps nonce management simple and progress legible.

* **Nonces** are managed locally. Foop reads the wallet's `pending` transaction
  count once, then vends incrementing nonces. On a nonce conflict or replacement
  error it resets to the latest on-chain value and retries.
* **Retries** — transient RPC errors are retried up to **3 times** with
  increasing backoff.
* **Failures are non-fatal** — a failed transaction is recorded and execution
  continues to the next one.

See [Nonce management & execution](../concepts/execution.md) for details.

## Live progress

```
84 / 84 transactions

████████████████████

84 confirmed  0 failed  0 pending

Total gas: 0.0178 ETH
```

## Flags

| Flag | Effect |
|---|---|
| `--yes`, `-y` | Skip the confirmation prompt. |
| `--mainnet-i-understand` | Required to run against a mainnet chain. |

## Exit code

`foop run` exits **1** if any transaction failed, otherwise **0**.

## Next

Interpret the results in [Observe](observe.md).
