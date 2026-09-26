# Nonce management & execution

The execution controller (`@foop/core`) submits a plan's transactions. It is
deliberately simple: **sequential**, one transaction at a time, waiting for each
receipt before sending the next.

## Sequential model

For each step, for each executable iteration, the controller:

1. Encodes calldata (ABI resolved once per step).
2. Takes the next local nonce.
3. Submits the transaction, with retries.
4. Waits for the receipt.
5. Records the outcome and reports it via callbacks.

Sequential submission trades throughput for predictability: nonces stay
in order, progress is easy to display, and one failure never corrupts the
others.

## Nonce management

The `NonceManager`:

* On `init()`, reads the wallet's transaction count at the **`pending`** block
  tag — so in-flight transactions from the same run are counted, avoiding
  collisions.
* Vends **incrementing** nonces via `next()`.
* On a nonce conflict or replacement error, `reset()` re-reads the pending count
  and resumes from the correct value.

Using `pending` rather than `latest` is what lets retries recover cleanly.

## Retries & backoff

Each submission is attempted up to **3 times** (`maxRetries`, default 3):

* **Nonce / replacement errors** → the nonce manager resets and the loop retries
  immediately with a fresh nonce.
* **Other RPC errors** → the controller backs off (`1.5s × attempt`) before
  retrying.

If all attempts fail, the transaction is recorded as `failed` with the error
reason and a zero hash, and execution moves on.

## Failure handling

* A transaction that reverts on-chain is recorded `failed` with its real hash
  and receipt data.
* A transaction that can't be submitted is recorded `failed` with a zero hash
  and a `failureReason`.
* Either way, **execution continues** — a mid-run failure doesn't abort the rest.

## Reporting

The controller emits two callbacks the CLI uses for live output:

* `onSubmit` — fired when a hash is known but the receipt is pending.
* `onSettle` — fired when a transaction confirms or fails.

At the end it returns an `ExecutionResult`: `submitted`, `confirmed`, `failed`,
`pending` (0 on a clean run), `totalGasUsed`, and the full `transactions` list.

## Related

* [Execute (lifecycle)](../lifecycle/execute.md)
* [Observe (lifecycle)](../lifecycle/observe.md)
