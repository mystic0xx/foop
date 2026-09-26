# Core concepts

## Workload

A **workload** is a declarative description of on-chain work: which chain, which
contract, which function, with which arguments and value, repeated how many
times. It lives in a plain JSON file that is easy to diff, review, and commit.

A workload contains one or more **steps**, executed in order.

```json
{
  "version": "1",
  "chain": 84532,
  "steps": [ /* ... */ ]
}
```

See the [workload file reference](../reference/workload-file.md) for the full schema.

## Step

A **step** is a single contract call plus a repeat count:

```json
{
  "contract": "0x4200000000000000000000000000000000000006",
  "function": "deposit()",
  "value": "10000000000000000",
  "repeat": 100
}
```

Foop resolves the ABI, encodes the calldata once, and submits the call `repeat`
times.

## Simulation

Before anything is signed, Foop **simulates** each step against live chain
state. It performs a static `eth_call` to catch reverts, estimates gas, reads
your native and (where relevant) token balances, and computes how many
iterations are actually affordable. Simulation is read-only and safe to run
repeatedly.

## The executable count

The heart of Foop's safety model. For every step, Foop computes:

```
executable = min(requested, maxByGas, maxByValue, maxByToken)
```

* `requested` — what you asked for (`repeat`)
* `maxByGas` — how many the wallet can afford in fees
* `maxByValue` — how many the native `value` can cover
* `maxByToken` — how many an ERC-20 balance allows (for `transferFrom`-style calls)

If any bound is below `requested`, the step is **constrained** and Foop reports
what blocked it. The requested count is always a **hard ceiling** — Foop never
runs beyond it.

## Execution

Only after you approve does Foop **execute**: it submits transactions
sequentially — one at a time, waiting for each receipt — while managing nonces
locally and retrying transient RPC errors. A failed transaction is recorded and
execution continues.

## Observation

After a run, Foop reports **confirmed / failed / pending** counts, total gas
used, and a record for every transaction (hash, status, block, gas).

## Where signing happens

Foop is **non-custodial**. The web UI signs through your browser wallet; the CLI
signs locally with a private key you supply via `FOOP_PRIVATE_KEY`. Foop stores
no keys and every transaction is a normal user-authorized interaction.
