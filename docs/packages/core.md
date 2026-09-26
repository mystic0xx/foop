# @foop/core

`@foop/core` is the engine shared between the CLI and the web UI. It contains no
UI and no key storage — just types, validation, simulation, and execution logic.

## Modules

| Module | Responsibility |
|---|---|
| `types.ts` | Shared types: `WorkloadFile`, `WorkloadStep`, `SimulationResult`, `StepSimulation`, `ExecutionResult`, `TxRecord`. |
| `abi-resolver.ts` | Resolve an ABI: provided → Blockscout → signature. |
| `simulation-engine.ts` | Read-only simulation of a workload into an executable plan. |
| `workload-planner.ts` | Validate a workload and run the engine; produce a `WorkloadPlan`. |
| `nonce-manager.ts` | Fetch and vend sequential nonces. |
| `execution-controller.ts` | Submit a plan's transactions sequentially, with retries. |

## Key exports

```ts
import {
  // planning
  planWorkload,
  validateWorkload,
  WorkloadValidationError,
  isMainnet,
  // simulation
  simulateWorkload,
  simulateStep,
  // execution
  executeWorkload,
  NonceManager,
  // abi
  resolveAbi,
  supportedChainIds,
  AbiResolveError,
} from "@foop/core";
```

## Planning

`planWorkload` is the main entry point the CLI uses. It validates the file,
simulates every step, and returns a `WorkloadPlan`:

```ts
const plan = await planWorkload({ file, client, walletAddress });
// plan.simulation    — SimulationResult
// plan.validation    — { warnings }
// plan.hasConstraints — some step has executable < requested
// plan.isMainnet     — chain is a known mainnet
```

`planWorkload` throws `WorkloadValidationError` on hard validation failures.

## Execution

`executeWorkload` takes the executable counts from a simulation and submits the
transactions, invoking `onSubmit` / `onSettle` callbacks as it goes:

```ts
const result = await executeWorkload({
  client, wallet, account, steps,
  executableCounts, chainId,
  onSettle: (record) => { /* live progress */ },
});
```

It signs with the `account` object passed in — the core never reads
environment variables or stores keys.

## Design notes

* **viem** is the only chain dependency.
* **BigInt everywhere** for balances, fees, and values.
* **No side effects on import** — pure functions plus a small `NonceManager`
  class.

## Related

* [Simulation engine](../concepts/simulation-engine.md)
* [Nonce management & execution](../concepts/execution.md)
* [Simulation result](../reference/simulation-result.md)
