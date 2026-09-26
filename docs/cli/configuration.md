# Configuration

The Foop CLI is configured entirely through environment variables. There is no
config file — settings live in your shell environment or the workload file
itself.

## Environment variables

| Variable | Used by | Description |
|---|---|---|
| `FOOP_RPC_URL` | `simulate`, `run` | RPC endpoint. Overridden by a workload's `rpc` field if present. |
| `FOOP_PRIVATE_KEY` | `run` (required), `simulate` (optional) | Hex private key for signing. In `simulate` it's only used to derive the wallet address for balance checks. |
| `FOOP_WALLET_ADDRESS` | `simulate` | Address to check balances against, without exposing a key. Takes precedence over deriving from `FOOP_PRIVATE_KEY`. |
| `ETHERSCAN_API_KEY` | all (ABI resolution) | Enables the Etherscan V2 ABI lookup tier. One key covers all supported chains. Optional — Blockscout and Sourcify still work without it. |
| `FOOP_HOME` | `save`, `list`, `show`, `rm`, `history`, `templates`, `new` | Store location for saved workloads, templates, and run history. Defaults to `~/.foop`. |

## RPC resolution order

For both `simulate` and `run`, the RPC URL is resolved as:

1. The workload file's `rpc` field, if set.
2. Otherwise `FOOP_RPC_URL`.

If neither is present, the command errors out.

## Wallet resolution

* **`foop run`** requires `FOOP_PRIVATE_KEY` and signs locally with it.
* **`foop simulate`** needs only an address: it uses `FOOP_WALLET_ADDRESS` if
  set, otherwise derives the address from `FOOP_PRIVATE_KEY`. It never signs.

## Example setup

```bash
# Testnet — safe defaults
export FOOP_RPC_URL="https://sepolia.base.org"
export FOOP_PRIVATE_KEY="0xYourTestnetPrivateKey"

# Simulate-only, without a key on this machine
export FOOP_RPC_URL="https://sepolia.base.org"
export FOOP_WALLET_ADDRESS="0xYourAddress"
```

{% hint style="warning" %}
Treat `FOOP_PRIVATE_KEY` like any other secret. Prefer a dedicated key that only
holds test funds, keep it out of shell history and version control, and never
use a key that controls mainnet assets while experimenting. See
[Safety & guardrails](../concepts/safety-and-guardrails.md).
{% endhint %}
