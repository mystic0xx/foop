# Quickstart

This walkthrough takes you from nothing to a simulated — and optionally
executed — workload in a few minutes. The example deposits ETH into WETH on
**Base Sepolia** (a testnet), repeated 100 times.

## 1. Scaffold a workload

Run the interactive scaffolder:

```bash
foop init
```

It will prompt you for a network, contract address, function, arguments, value,
and repeat count, attempting to fetch the contract's ABI from Blockscout along
the way. Answer with:

* **Network** — Base Sepolia (84532)
* **Contract** — `0x4200000000000000000000000000000000000006` (WETH)
* **Function** — `deposit()`
* **Value** — `0.01`
* **Repeat** — `100`

It writes `workload.json`:

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

## 2. Point Foop at an RPC

Simulation and execution need an RPC endpoint. Set it in your environment (or
add an `rpc` field to the workload file):

```bash
export FOOP_RPC_URL="https://sepolia.base.org"
```

To let `foop simulate` check your balances, also give Foop an address — either
directly, or via the private key it will later sign with:

```bash
export FOOP_WALLET_ADDRESS="0xYourAddress"
# or
export FOOP_PRIVATE_KEY="0xYourTestnetKey"
```

## 3. Simulate — no signing

```bash
foop simulate workload.json
```

Foop validates the file, checks your balance, estimates gas, and reports how
many of the 100 transactions are executable and what would block the rest. This
step **never signs or sends** anything.

## 4. Execute

When you're happy with the plan, execute it. This requires `FOOP_PRIVATE_KEY`:

```bash
foop run workload.json
```

Foop re-simulates, shows the plan, and asks you to confirm before submitting the
executable transactions one at a time — printing live progress and a final
summary.

{% hint style="warning" %}
Use a **dedicated testnet key** with only test funds. Never paste a key that
controls mainnet assets. See [Safety & guardrails](../concepts/safety-and-guardrails.md).
{% endhint %}

## Next

* Understand the model in [Core concepts](core-concepts.md)
* Read the full [Workload lifecycle](../lifecycle/overview.md)
