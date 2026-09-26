# Supported chains

Foop is EVM-agnostic: it works with any EIP-155 chain as long as you supply a
matching RPC URL. Some features — chain-name display, `foop init` presets, and
automatic ABI lookup — are enhanced for the chains listed here.

## `foop init` network presets

`foop init` offers these networks in its selector:

| Network | Chain ID |
|---|---|
| Base Sepolia | 84532 |
| Base | 8453 |
| Ethereum Mainnet | 1 |
| Optimism | 10 |
| Arbitrum One | 42161 |
| Polygon | 137 |
| Sepolia | 11155111 |
| Anvil / Hardhat | 31337 |

You can still target any other chain by writing the `chain` field manually.

## Friendly chain names

The CLI displays names for these chain IDs (others show as `Chain <id>`):

`1` Ethereum Mainnet · `10` Optimism · `8453` Base · `84532` Base Sepolia ·
`42161` Arbitrum One · `137` Polygon · `11155111` Sepolia · `31337` Anvil / Hardhat

## Blockscout ABI coverage

Automatic ABI resolution works on chains with a mapped Blockscout instance:

| Chain | Chain ID | Blockscout |
|---|---|---|
| Ethereum | 1 | eth.blockscout.com |
| Optimism | 10 | optimism.blockscout.com |
| Base | 8453 | base.blockscout.com |
| Base Sepolia | 84532 | base-sepolia.blockscout.com |
| Arbitrum One | 42161 | arbitrum.blockscout.com |
| Polygon | 137 | polygon.blockscout.com |
| Sepolia | 11155111 | eth-sepolia.blockscout.com |

On chains without Blockscout coverage, supply an `abi` field or a precise
function signature — see [ABI resolution](abi-resolution.md).

## Mainnet chains (guarded)

These chain IDs are treated as **mainnet**, and `foop run` refuses to execute
against them without `--mainnet-i-understand`:

`1` Ethereum · `10` Optimism · `8453` Base · `42161` Arbitrum One ·
`137` Polygon · `43114` Avalanche · `56` BNB Chain

See [Safety & guardrails](../concepts/safety-and-guardrails.md).
