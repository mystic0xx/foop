# foop simulate

Validate and simulate a workload against live chain state, then report how many
transactions are executable. **Read-only** — nothing is signed or submitted.

```bash
foop simulate <workload.json>
```

## Arguments

| Argument | Required | Description |
|---|---|---|
| `<workload.json>` | Yes | Path to the workload file, relative to the current directory. |

## Requirements

* An **RPC URL** — from the workload's `rpc` field or `FOOP_RPC_URL`.
* A **wallet address** to check balances against — from `FOOP_WALLET_ADDRESS`,
  or derived from `FOOP_PRIVATE_KEY` if set. Simulation never uses the key to
  sign; it only needs the address.

If neither address source is available, `simulate` errors out.

## What it prints

```
FOOP SIMULATE  Base Sepolia
  1 step(s)  ·  workload.json

100 transactions requested

Estimated gas      0.021 ETH
Transaction value  1.000 ETH
Wallet balance     0.843 ETH

Executable         84
Blocked by         ETH balance

Suggested bound    84
```

It also surfaces:

* **Validation warnings** — e.g. large steps (> 500 transactions).
* **A mainnet notice** — informational when the target is a mainnet chain.
* **A large-workload notice** — when the total requested exceeds 500.

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Every requested transaction is executable. |
| `1` | The workload is constrained (some transactions can't run), the file is invalid, or the RPC/chain check failed. |

This makes `foop simulate` a natural **CI gate**: fail the build if a workload
can't fully execute.

## Errors

* **Validation errors** (bad version, chain, step, address, repeat, or value)
  abort with a clear message.
* **Chain mismatch** — if the RPC's chain ID differs from the workload's
  `chain`, simulation aborts.

## See also

* [Simulate (lifecycle)](../lifecycle/simulate.md) — the full simulation model
* [Simulation result](../reference/simulation-result.md) — the result shape
