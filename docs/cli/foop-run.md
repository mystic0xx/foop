# foop run

Simulate a workload, prompt for approval, then execute it and report the
results. **Signs and submits transactions** — requires a private key.

```bash
foop run <workload.json> [--yes] [--mainnet-i-understand]
```

## Arguments & flags

| Argument / flag | Description |
|---|---|
| `<workload.json>` | Path to the workload file. Required. |
| `--yes`, `-y` | Skip the confirmation prompt and execute the plan directly. |
| `--mainnet-i-understand` | Required to run against a mainnet chain. Without it, the command refuses to proceed. |

## Requirements

* **`FOOP_PRIVATE_KEY`** — the CLI signs locally with this key. Required.
* **An RPC URL** — from the workload's `rpc` field or `FOOP_RPC_URL`.

## Flow

1. Loads config and the workload file.
2. **Mainnet gate** — aborts on a mainnet chain unless `--mainnet-i-understand`
   is present.
3. **Simulates** the workload (validation + simulation).
4. Prints warnings, the mainnet/large-workload notices, and the simulation
   table.
5. Aborts if **0** transactions are executable.
6. **Prompts** `Execute N transaction(s)? [y/N]` — unless `--yes`.
7. **Executes** sequentially, printing a line per settled transaction and a live
   progress bar.
8. Prints the final **summary**.

## Example

```bash
export FOOP_PRIVATE_KEY=0xTestnetKey
export FOOP_RPC_URL=https://sepolia.base.org
foop run workload.json -y
```

```
FOOP RUN  Base Sepolia
  Wallet  0x1234…abcd
  File    workload.json

... simulation table ...

EXECUTING
84 / 84 transactions
████████████████████
84 confirmed  0 failed  0 pending
Total gas: 0.0178 ETH
```

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Run completed with no failed transactions. |
| `1` | A transaction failed, the mainnet gate blocked the run, 0 executable, or a load/validation error occurred. |

{% hint style="danger" %}
`foop run` broadcasts real transactions. On mainnet this spends real funds. Use
a dedicated key with test funds and always review the simulation before
confirming. See [Safety & guardrails](../concepts/safety-and-guardrails.md).
{% endhint %}

## See also

* [Execute (lifecycle)](../lifecycle/execute.md)
* [Nonce management & execution](../concepts/execution.md)
