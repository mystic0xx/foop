# Foop CLI — Build Checklist

## 1. Monorepo scaffold ✅
- [x] `pnpm-workspace.yaml` — declare `packages/*` and `apps/*`
- [x] Root `package.json` — workspace root, scripts
- [x] `packages/core/package.json`
- [x] `packages/cli/package.json`
- [x] Root `tsconfig.json` + per-package `tsconfig.json`

## 2. `packages/core` — shared types ✅
- [x] `src/types.ts` — `WorkloadFile`, `WorkloadStep`, `SimulationResult`, `StepSimulation`, `ExecutionResult`, `TxRecord`

## 3. `packages/core` — ABI resolver ✅
- [x] `src/abi-resolver.ts` — fetch verified ABI from Blockscout by chain ID + address
- [x] Fallback: accept raw ABI array in workload file (`abi` field)
- [x] Fallback: parse human-readable function signature

## 4. `packages/core` — simulation engine ✅
- [x] `src/simulation-engine.ts`
- [x] `eth_call` on first iteration — revert detection + decode reason
- [x] `eth_estimateGas` — single estimate with 1.2× safety buffer
- [x] Native balance fetch (`eth_getBalance`)
- [x] ERC-20 balance fetch (`balanceOf`) when step transfers tokens
- [x] Allowance check when step calls `transferFrom`
- [x] Fee data fetch (`eth_feeHistory` / `eth_maxFeePerGas`)
- [x] Compute `maxByGas`, `maxByValue`, `maxByToken`
- [x] Compute `executable = min(requested, maxByGas, maxByValue, maxByToken)`
- [x] Flag state-dependent workloads (warn estimate may drift)
- [x] All math in BigInt — no JS floats

## 5. `packages/core` — workload planner ✅
- [x] `src/workload-planner.ts`
- [x] Accept `WorkloadFile`, run simulation per step
- [x] Produce overall `SimulationResult` with per-step breakdown
- [x] Validate inputs: address format, chain ID present, repeat > 0, steps non-empty

## 6. `packages/cli` — scaffold ✅
- [x] `src/index.ts` — entry point, command router (`simulate` / `run` / `init`)
- [x] `tsup.config.ts` — bundle to single `dist/index.js`, shebang
- [x] `config.ts` — load `FOOP_PRIVATE_KEY`, `FOOP_RPC_URL` from env

## 7. `packages/cli` — renderer ✅
- [x] `src/renderer/progress.ts` — terminal output helpers (tables, progress bar, status lines)

## 8. `packages/cli` — `foop simulate` ✅
- [x] `src/commands/simulate.ts`
- [x] Load + validate workload JSON file
- [x] Run workload planner
- [x] Render simulation result table (requested / gas / value / balance / executable / blocked-by)
- [x] Exit 0 if all requested are executable; exit 1 if blocked

## 9. `packages/cli` — `foop run`
- [ ] `src/commands/run.ts`
- [ ] Run simulate first (always)
- [ ] Show plan + prompt for confirmation (`--yes` / `-y` to skip)
- [ ] Hard-exit on mainnet without `--mainnet-i-understand`
- [ ] `src/core/execution-controller.ts` — sequential tx loop
- [ ] `src/core/nonce-manager.ts` — fetch pending nonce, increment locally
- [ ] Send tx, wait for receipt, record result
- [ ] Retry up to 3× on RPC error with backoff
- [ ] Render live progress per transaction
- [ ] Render final summary (confirmed / failed / pending / total gas / avg gas)

## 10. `packages/cli` — `foop init`
- [ ] `src/commands/init.ts`
- [ ] Interactive prompts: chain ID, contract address, ABI fetch, function select, args, value, repeat
- [ ] Write `workload.json` to disk
- [ ] Print next-step hint: `foop simulate workload.json`

## 11. Validation & guardrails
- [ ] Reject workload with 0 steps
- [ ] Reject `repeat` < 1 or > 10,000 (soft upper bound with warning > 500)
- [ ] Mainnet chain ID detection → require `--mainnet-i-understand`
- [ ] Large workload warning (> 500 txs) even on testnet
- [ ] Never run to fund exhaustion — hard executable bound

## 12. Testing
- [ ] Unit tests for simulation engine (mock viem client)
- [ ] Unit tests for workload planner (edge cases: 0 balance, exact balance, ERC-20 path)
- [ ] Integration test: `foop simulate` against a public testnet RPC (WETH on Base Sepolia)
