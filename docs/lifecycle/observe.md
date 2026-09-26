# 4. Observe

After execution, Foop reports what actually happened — both a per-transaction
record and an aggregate summary.

## The summary

```
84 confirmed  0 failed  0 pending

Total gas: 0.0178 ETH
```

Foop reports:

| Field | Meaning |
|---|---|
| `submitted` | Transactions that were broadcast to the network. |
| `confirmed` | Transactions included with a success receipt. |
| `failed` | Transactions that reverted on-chain or could not be submitted. |
| `pending` | Still unconfirmed. On a clean sequential run this is **0**. |
| `totalGasUsed` | Sum of `gasUsed` across confirmed transactions. |

## Per-transaction records

Every transaction produces a `TxRecord`:

| Field | Meaning |
|---|---|
| `stepIndex` | Which step (0-based) the transaction belongs to. |
| `iteration` | Which iteration within the step (0-based). |
| `hash` | Transaction hash — use it to look the tx up on an explorer. |
| `status` | `confirmed`, `failed`, or `pending`. |
| `gasUsed` | Gas consumed (after confirmation). |
| `blockNumber` | Block of inclusion. |
| `failureReason` | Populated when `status` is `failed`. |

In the web UI these become explorer links for every transaction. On the CLI they
stream as they settle, so you see each hash and its status in real time.

## Interpreting failures

* A transaction that **could not be submitted** (after retries) is recorded with
  a zero hash and a `failureReason`.
* A transaction that was **mined but reverted** is recorded `failed` with its
  real hash — inspect it on an explorer to see why.

Because execution is sequential and failures don't halt the run, a partial run
still gives you a complete, faithful record of what landed and what didn't.
