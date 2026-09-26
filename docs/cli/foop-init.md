# foop init

Interactively scaffold a `workload.json` file. Nothing is signed or sent — the
command only writes a file to disk.

```bash
foop init
```

## Prompts

`init` walks through the following, in order:

| Prompt | Notes |
|---|---|
| **Select network** | Choose from a preset list (Base Sepolia, Base, Ethereum, Optimism, Arbitrum, Polygon, Sepolia, Anvil/Hardhat). |
| **RPC URL** | Optional. Leave blank to use `FOOP_RPC_URL`. Must start with `http`. |
| **Contract address** | Validated as a `0x` + 40-hex-char address. |
| **Function** | If the contract is verified on Blockscout, Foop lists its **writable** functions to choose from; otherwise you type the signature manually. |
| **Arguments** | Comma-separated positional args; leave blank if none. |
| **ETH value per transaction** | Entered in **ETH** (e.g. `0.01`), converted to wei in the file. Blank means 0. |
| **Number of times to repeat** | Positive integer, 1–10,000. |
| **Output file path** | Defaults to `workload.json`. |

## ABI fetching

After you enter the contract address, `init` attempts to fetch the verified ABI
from Blockscout for the selected chain:

* **Verified with writable functions** → you pick from a list of signatures.
* **Verified but no writable functions**, **unverified**, or **fetch failed**
  → you enter the function signature manually.

See [ABI resolution](../reference/abi-resolution.md) and
[Supported chains](../reference/supported-chains.md).

## Output

`init` writes a single-step workload, for example:

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

and prints the next steps:

```
Wrote workload.json

Next steps:
  foop simulate workload.json
  foop run workload.json
```

## Cancelling

Pressing the cancel key at any prompt exits cleanly with **0** and writes
nothing.
