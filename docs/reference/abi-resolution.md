# ABI resolution

To encode calldata, Foop needs a contract's ABI. It resolves one using a
five-tier priority order, so a workload works whether or not the contract is
verified on any single explorer.

## Resolution order

```
1. Provided ABI → 2. Blockscout → 3. Etherscan → 4. Sourcify → 5. Signature
```

| Priority | Source | When it's used |
|---|---|---|
| 1 | **Provided** | The step's `abi` field is present and non-empty. Used verbatim. |
| 2 | **Blockscout** | No ABI provided; the contract is verified on a supported Blockscout instance. |
| 3 | **Etherscan** | Not on Blockscout; the contract is verified on Etherscan. Multichain via the V2 API — requires `ETHERSCAN_API_KEY`. |
| 4 | **Sourcify** | Not on either explorer; the contract is verified on Sourcify. Keyless. |
| 5 | **Signature** | None of the above; a minimal ABI is parsed from the human-readable `function` signature. |

If even signature parsing fails, resolution throws an `AbiResolveError` asking
you to supply an explicit `abi`.

## 1. Provided ABI

Add an `abi` field to the step. This is the most robust option — no network
lookup, no ambiguity — and is recommended for overloaded functions or complex
argument types.

```json
{
  "contract": "0xContract",
  "function": "deposit(uint256)",
  "abi": [
    { "type": "function", "name": "deposit", "stateMutability": "nonpayable",
      "inputs": [{ "name": "amount", "type": "uint256" }], "outputs": [] }
  ],
  "args": ["1000000000000000000"],
  "repeat": 10
}
```

## 2. Blockscout lookup

For verified contracts, Foop fetches the ABI from the Blockscout instance
mapped to the chain (10-second timeout). `foop init` uses this to list a
contract's writable functions. See [Supported chains](supported-chains.md) for
the Blockscout coverage list.

## 3. Etherscan lookup

When Blockscout has no verified ABI, Foop tries Etherscan's V2 API. A single
`ETHERSCAN_API_KEY` covers every supported chain (Ethereum, Base, Arbitrum,
Optimism, Polygon, and their testnets) through one endpoint using the `chainid`
parameter. Without the key set, this tier is skipped — Etherscan V2 rejects
keyless requests — and resolution falls through to Sourcify.

## 4. Sourcify lookup

Sourcify is a keyless, multichain verification repository. Foop queries its v2
contract API and uses the returned ABI when the contract has a full or partial
match. This often covers chains that have no Blockscout instance mapped.

## 5. Signature fallback

Foop parses the `function` field as a human-readable signature into a minimal
ABI:

```
deposit()                      →  function deposit()
transfer(address,uint256)      →  function transfer(address,uint256)
```

This is enough to encode the call as long as the signature and `args` match.
It's the reason a workload can run against an unverified contract with no `abi`
field.

## Recommendation

* Prototyping against a well-known verified contract → rely on **Blockscout /
  Etherscan / Sourcify** (set `ETHERSCAN_API_KEY` to widen coverage).
* Committing a workload for repeatable, offline-safe runs → embed the **`abi`**
  or a precise **signature** so resolution never depends on an external service.
