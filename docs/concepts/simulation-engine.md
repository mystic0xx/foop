# Simulation engine

The simulation engine (`@foop/core`) is the read-only core that turns a workload
into an executable plan. This page explains what it does per workload and per
step.

## Per-workload setup

Before touching any step, the engine:

1. **Checks the chain.** It calls `eth_chainId` and aborts if the result differs
   from the workload's `chain`.
2. **Fetches shared state once.** It reads the wallet's native balance
   (`eth_getBalance`) and fee data (`estimateFeesPerGas`) a single time, and
   reuses them across all steps — keeping simulation cheap.

The base and priority fees derived here feed every step's fee math.

## Per-step simulation

For each step, in order:

### 1. Resolve ABI & encode

The engine resolves the ABI (provided → Blockscout → signature) and encodes the
calldata once from the function name and `args`.

### 2. Revert detection (`eth_call`)

It runs a static `eth_call` from the wallet address with the step's value. If it
reverts, the engine decodes the reason, marks the step `blockedBy: "revert"`,
and returns **0 executable** — no gas is estimated for a call that can't
succeed.

### 3. Gas estimate + buffer

Otherwise it calls `eth_estimateGas` and multiplies by **1.2×** (integer math:
`× 12 / 10`) for a safety margin. If estimation fails, it falls back to a
conservative **300,000** gas.

### 4. Fee per transaction

```
effectiveGasPrice = baseFee + priorityFee
feePerTx          = gasPerTx × effectiveGasPrice
```

All BigInt — no floating point anywhere in the cost path.

### 5. The three bounds

```
costPerTx  = feePerTx + valuePerTx
maxByGas   = balance / costPerTx          (or requested, if cost is 0)
maxByValue = balance / (valuePerTx + fee) (null if value is 0)
maxByToken = tokenBalance / tokenAmount   (transferFrom-style calls only)
```

For `transferFrom`-style functions with an amount argument, the engine reads the
wallet's ERC-20 `balanceOf` on the contract to derive `maxByToken`. Non-standard
tokens or failed reads simply skip the token bound.

### 6. Executable & blocked-by

```
executable = min(requested, maxByGas, maxByValue, maxByToken)
```

If `executable < requested`, the engine records the primary constraint
(`eth_balance`, `token_balance`, …).

### 7. State-dependent warning

For repeated (`> 1`) calls to state-mutating functions that aren't simple
transfers or deposits, the engine flags `stateDependentWarning`: a single
up-front gas estimate may not hold as on-chain state changes across iterations.

## Design principles

* **Read-only.** The engine never signs or submits. It's safe to run anytime.
* **One estimate, many iterations.** Gas is estimated once per step and scaled —
  fast, with the buffer and warning to cover drift.
* **Exact arithmetic.** BigInt end to end; string inputs preserve `uint256`
  precision.

## Related

* [Simulation result](../reference/simulation-result.md)
* [Simulate (lifecycle)](../lifecycle/simulate.md)
