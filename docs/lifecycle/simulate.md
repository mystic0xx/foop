# 2. Simulate

Simulation is Foop's pre-flight check. It runs entirely against live chain state
using read-only RPC calls — **nothing is signed or submitted**.

```bash
foop simulate workload.json
```

## What simulation does

For the workload as a whole, Foop:

1. **Validates** the file — version, chain ID, step shape, addresses, repeat
   bounds, value format. Hard violations abort; soft issues become warnings.
2. **Confirms the chain matches** — the RPC's chain ID must equal the
   workload's `chain`, or simulation aborts with a mismatch error.
3. **Fetches shared state once** — your native balance and current fee data.

Then for each step it:

1. **Resolves the ABI** (provided → Blockscout → signature). See
   [ABI resolution](../reference/abi-resolution.md).
2. **Encodes the calldata**.
3. **Runs `eth_call`** on the first iteration to detect reverts and decode the
   reason. A revert means **0 executable** for that step.
4. **Estimates gas** with `eth_estimateGas`, applying a **1.2× safety buffer**
   (falling back to 300,000 gas if estimation fails).
5. **Computes the fee** per transaction as `gas × (baseFee + priorityFee)`,
   using BigInt math throughout — no floating point.
6. **Reads token balances** for `transferFrom`-style calls to bound by ERC-20
   holdings.
7. **Computes the executable count** — see below.

## The executable count

```
executable = min(requested, maxByGas, maxByValue, maxByToken)
```

| Bound | Meaning |
|---|---|
| `maxByGas` | How many iterations the wallet balance covers in fees (+ value). |
| `maxByValue` | How many the native `value` can fund. `null` if the step sends no value. |
| `maxByToken` | How many an ERC-20 balance allows. `null` if not a token-spending call. |

If `executable < requested`, the step reports a `blockedBy` reason:
`eth_balance`, `token_balance`, `allowance`, or `revert`.

## Reading the output

```
100 transactions requested

Estimated gas      0.021 ETH
Transaction value  1.000 ETH
Wallet balance     0.843 ETH

Executable         84
Blocked by         ETH balance

Suggested bound    84
```

## Exit codes

`foop simulate` exits **0** when every requested transaction is executable, and
**1** when the workload is constrained — making it usable as a CI gate.

## State-dependent warnings

For repeated calls to functions that mutate state (anything other than simple
transfers/deposits), Foop flags a **state-dependent warning**: the single gas
estimate may drift across iterations as on-chain state changes.

## Next

Happy with the plan? [Execute it](execute.md).
