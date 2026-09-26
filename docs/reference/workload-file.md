# Workload file

A workload file is a JSON document describing on-chain work. It is the single
input to `foop simulate` and `foop run`, and the output of `foop init`.

## Top-level schema

```json
{
  "version": "1",
  "chain": 84532,
  "rpc": "https://sepolia.base.org",
  "steps": [ /* WorkloadStep[] */ ]
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `version` | `"1"` | Yes | Schema version. Currently must be `"1"`. |
| `chain` | `number` | Yes | EIP-155 chain ID. Must be a positive integer and match the RPC's chain. |
| `rpc` | `string` | No | RPC URL. Falls back to `FOOP_RPC_URL`. |
| `steps` | `WorkloadStep[]` | Yes | Ordered list of steps. Must contain at least one. |

## Step schema

```json
{
  "contract": "0x4200000000000000000000000000000000000006",
  "function": "transfer(address,uint256)",
  "abi": [ /* optional Abi */ ],
  "args": ["0xRecipient", "1000000000000000000"],
  "value": "0",
  "repeat": 100
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `contract` | `Address` | Yes | Target contract address (checksummed or lowercase hex). |
| `function` | `string` | Yes | Human-readable signature, e.g. `deposit()` or `transfer(address,uint256)`. |
| `abi` | `Abi` | No | Explicit ABI for this step. If omitted, resolved via Blockscout or the signature. |
| `args` | `string[]` | No | Positional arguments matching the signature. **All values as strings.** |
| `value` | `string` | No | Native value to send, in **wei**, as a string to avoid precision loss. |
| `repeat` | `number` | Yes | Iteration count. Integer ≥ 1 and ≤ 10,000. |

## Validation rules

The planner enforces these before simulating. A violation is a hard error.

* `version` must equal `"1"`.
* `chain` must be a positive integer.
* `steps` must be a non-empty array.
* Each `contract` must be a valid address.
* Each `function` must be non-empty.
* Each `repeat` must be an integer between **1** and **10,000**.
* Each `value`, if present, must be a **non-negative** integer string (wei).

### Soft warnings

* A step with `repeat` > **500** produces a warning (it will still run).
* A total requested count > 500 triggers a large-workload notice.

## Notes on values and arguments

* **Everything numeric is a string.** `value` and numeric `args` are strings to
  preserve `uint256` precision — Foop parses them as BigInt.
* **`value` is in wei**, not ETH. `foop init` accepts ETH for convenience and
  converts it; hand-written files must use wei.

## Minimal example

```json
{
  "version": "1",
  "chain": 84532,
  "steps": [
    { "contract": "0x4200000000000000000000000000000000000006", "function": "deposit()", "value": "10000000000000000", "repeat": 100 }
  ]
}
```
