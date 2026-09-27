# Foop

> Stop writing scripts for throwaway on-chain workloads. Just Foop it!

Foop lets blockchain developers define, simulate, and execute repeatable on-chain workloads without writing one-off transaction scripts.

## Why

Seeding protocol activity, populating test environments, or reproducing a transaction sequence shouldn't require a custom Foundry/viem/ethers script every time. Foop turns:

```
Explorer → click → sign → wait → repeat ×100
```

into:

```
Define → Simulate → Review → Execute → Observe
```

## How it works

### 1. Define

Connect your wallet, paste a contract address, select a function, set your arguments and iteration count.

```
Network:    Base Sepolia
Contract:   WETH
Function:   deposit()
Value:      0.01 ETH
Iterations: 100
```

### 2. Simulate

Before you sign anything, Foop checks your balances, estimates gas, detects expected reverts, and tells you exactly how many transactions are executable.

```
100 transactions requested

Estimated gas      0.021 ETH
Transaction value  1.000 ETH
Wallet balance     0.843 ETH

Executable         84
Blocked by         ETH balance

Suggested bound    84
```

### 3. Execute

After you approve the plan, Foop manages nonces, submits transactions, tracks receipts, and shows live progress.

```
84 / 84 transactions

████████████████████

84 confirmed  0 failed  0 pending

Total gas: 0.0178 ETH
```

### 4. Observe

Full run summary: confirmed, failed, pending counts, total and average gas, and explorer links for every transaction.

## Use cases

- Protocol testing
- Testnet seeding
- Indexer development
- Analytics testing
- Frontend development
- Reproducing protocol states
- Load testing / QA
- Demo and staging environments

## Stack

- **Next.js / React** — web UI
- **TypeScript** — end to end
- **viem** — chain interaction
- **Browser wallet** — signing (Foop never holds private keys)
- **EVM-compatible chains** — Base, Base Sepolia, and more

## Packages

| Package | Description |
|---|---|
| `@foop/core` | Simulation engine, workload planner, execution controller — shared between CLI and web |
| `@foop/cli` | Terminal interface: `foop ai`, `foop simulate`, `foop run`, `foop init` |

## CLI

```bash
# Describe a workload in plain English — Claude builds, simulates, and explains it
foop ai "deposit 0.01 ETH 10 times into 0x4200…0006 on Base Sepolia"

# Run with no command for an interactive launcher (AI / provide your own / scaffold)
foop

# Dry-run a workload file — no signing required
foop simulate workload.json

# Simulate then execute with confirmation
foop run workload.json

# Interactively scaffold a workload file
foop init

# Save, reuse, and review workloads
foop save workload.json my-seed     # store it in ~/.foop
foop list                           # list saved workloads
foop run my-seed                    # run a saved workload by name
foop history                        # review past runs

# Start from a bundled template
foop templates                      # wrap-eth, erc20-approve, uniswap-swap, …
foop new wrap-eth my-wrap
```

Anywhere a command takes a workload, you can pass a **file path** or a **saved
name**. Workload files are plain JSON and version-control friendly:

```json
{
  "version": "1",
  "chain": 84532,
  "steps": [
    {
      "contract": "0x4200000000000000000000000000000000000006",
      "function": "deposit()",
      "value": "10000000000000000",
      "repeat": 100
    }
  ]
}
```

### foop ai

Don't want to hand-write JSON? Describe the workload in plain English and Claude
builds it — resolving the contract's real function from its ABI, asking for
anything it can't infer (it never invents addresses or amounts), then simulating
and explaining, in plain English, exactly what you're about to sign before
executing through the same guarded `foop run` pipeline.

```bash
foop ai "wrap 0.01 ETH 10 times on Base Sepolia"
```

Set `ANTHROPIC_API_KEY` (or `ANTHROPIC_AUTH_TOKEN` + `ANTHROPIC_BASE_URL` for an
Anthropic-compatible provider). `FOOP_AI_MODEL` selects the model (default
`claude-sonnet-5`).

### ABI resolution

Foop resolves each contract's ABI in priority order —
**provided → Blockscout → Etherscan → Sourcify → signature** — so a workload
runs whether or not the contract is verified on any single explorer. Set
`ETHERSCAN_API_KEY` to enable the Etherscan tier (one key covers all chains);
Sourcify needs no key.

### Revert diagnostics

When simulation detects a revert, Foop decodes the real reason from the revert
data — `Error(string)`, `Panic(uint256)`, custom errors from the step ABI, and
unknown selectors looked up via openchain.xyz — instead of a generic
"execution reverted".

## Security

Foop does not custody private keys. All transactions are normal user-authorized wallet interactions. Simulation always runs before execution. The requested iteration count is a hard upper bound — Foop will never silently run until funds are exhausted.

## Roadmap

- **V1** — Web UI: define, simulate, execute, observe
- **V1.5** — Saved workloads, workload history, reusable templates *(CLI: shipped)*; multi-step workloads with inter-step data passing *(in progress)*
- **V2** — CLI, CI/CD, workload files, team sharing, agent-callable execution API
