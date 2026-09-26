# 1. Define

Defining a workload means describing the on-chain work you want to repeat. The
output is a JSON file — nothing is signed or sent at this stage.

## What you provide

For each step:

* **Contract** — the target contract address
* **Function** — a human-readable signature, e.g. `deposit()` or
  `transfer(address,uint256)`
* **Arguments** — positional args matching the signature, as strings
* **Value** — native token to send with the call, in **wei** (as a string)
* **Repeat** — how many times to run the call (1–10,000)

Plus, at the workload level, the **chain ID** and optionally an **RPC URL**.

## The interactive way: `foop init`

`foop init` walks you through each field with prompts, and tries to fetch the
contract's verified ABI from Blockscout so it can offer a list of writable
functions to pick from.

```bash
foop init
```

```
◆  Select network
│  Base Sepolia (84532)
◆  Contract address
│  0x4200000000000000000000000000000000000006
◇  ABI fetched — 3 writable function(s) found
◆  Select function
│  deposit()
◆  ETH value per transaction
│  0.01
◆  Number of times to repeat
│  100
◇  Wrote workload.json
```

Note that `init` accepts value in **ETH** for convenience and converts it to wei
in the file. See [foop init](../cli/foop-init.md) for the full prompt list.

## The manual way

Because a workload is just JSON, you can also write or generate it directly:

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

This is the version-control-friendly path: commit the file, review it in a PR,
and re-run it deterministically.

## Multi-step workloads

Add more entries to `steps` to run several calls in sequence. Steps execute in
array order.

```json
{
  "version": "1",
  "chain": 84532,
  "steps": [
    { "contract": "0xToken", "function": "approve(address,uint256)", "args": ["0xSpender", "1000000000000000000"], "repeat": 1 },
    { "contract": "0xVault", "function": "deposit(uint256)", "args": ["1000000000000000000"], "repeat": 10 }
  ]
}
```

## Next

Once defined, [simulate](simulate.md) the workload.
