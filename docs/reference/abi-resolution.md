# ABI resolution

To encode calldata, Foop needs a contract's ABI. It resolves one using a
three-tier priority order, so a workload works whether or not the contract is
verified.

## Resolution order

```
1. Provided ABI  →  2. Blockscout  →  3. Signature
```

| Priority | Source | When it's used |
|---|---|---|
| 1 | **Provided** | The step's `abi` field is present and non-empty. Used verbatim. |
| 2 | **Blockscout** | No ABI provided; the contract is verified on a supported Blockscout instance. |
| 3 | **Signature** | Neither above; a minimal ABI is parsed from the human-readable `function` signature. |

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
contract's writable functions. Unverified contracts, network errors, and
unsupported chains fall through to the next tier. See
[Supported chains](supported-chains.md) for the Blockscout coverage list.

## 3. Signature fallback

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

* Prototyping against a well-known verified contract → rely on **Blockscout**.
* Committing a workload for repeatable, offline-safe runs → embed the **`abi`**
  or a precise **signature** so resolution never depends on an external service.
