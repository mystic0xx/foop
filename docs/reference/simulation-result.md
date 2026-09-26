# Simulation result

`foop simulate` and the planning step of `foop run` produce a `SimulationResult`.
This page documents its shape — the same types `@foop/core` returns.

## SimulationResult

| Field | Type | Description |
|---|---|---|
| `walletAddress` | `Address` | Wallet used for simulation. |
| `chainId` | `number` | Chain ID. |
| `steps` | `StepSimulation[]` | Per-step results. |
| `fullyExecutable` | `boolean` | True if every step is fully executable as requested. |
| `nativeBalance` | `bigint` | Wallet's native balance at simulation time, in wei. |
| `baseFee` | `bigint` | Current base fee, in wei. |

## StepSimulation

| Field | Type | Description |
|---|---|---|
| `stepIndex` | `number` | 0-based step index. |
| `requested` | `number` | Iterations requested (`repeat`). |
| `gasPerTx` | `bigint` | Gas estimate per tx, with the 1.2× buffer applied. |
| `valuePerTx` | `bigint` | Native value per tx, in wei. |
| `feePerTx` | `bigint` | Estimated fee per tx (`gasPerTx × effective gas price`). |
| `maxByGas` | `number` | Max iterations affordable by the fee (+ value) budget. |
| `maxByValue` | `number \| null` | Max iterations by native value. `null` if the step sends none. |
| `maxByToken` | `number \| null` | Max iterations by ERC-20 balance. `null` if not applicable. |
| `executable` | `number` | Final count: `min(requested, maxByGas, maxByValue, maxByToken)`. |
| `blockedBy` | `BlockedByReason` | Primary constraint, or `"none"`. |
| `stateDependentWarning` | `boolean` | True if the estimate may drift across iterations. |
| `revertReason` | `string?` | Decoded revert reason from `eth_call`, if detected. |

## BlockedByReason

```ts
type BlockedByReason =
  | "eth_balance"    // native balance limits fee/value budget
  | "token_balance"  // ERC-20 holdings limit a transferFrom
  | "allowance"      // ERC-20 allowance limits a transferFrom
  | "revert"         // eth_call reverted — 0 executable
  | "none";          // fully executable
```

## Interpreting results

* `fullyExecutable === true` → every requested transaction can run;
  `foop simulate` exits 0.
* Any step with `executable < requested` → the workload is constrained;
  `foop simulate` exits 1 and reports `blockedBy`.
* `blockedBy === "revert"` → the call fails statically; check `revertReason`.
  Nothing in that step is executable. Foop decodes the reason from the revert
  data — standard `Error(string)` / `Panic(uint256)`, custom errors in the step
  ABI, and unknown selectors resolved via the openchain.xyz signature database —
  so you see e.g. `custom error InsufficientReputation(0, 10000)` rather than a
  generic "execution reverted".

## Related

* [Simulate (lifecycle)](../lifecycle/simulate.md)
* [Simulation engine](../concepts/simulation-engine.md)
