# Overview

Every workload in Foop moves through the same four-stage lifecycle. It's the
mental model behind both the web UI and the CLI.

```
Define → Simulate → Review → Execute → Observe
```

| Stage | What happens | Signs? |
|---|---|---|
| [**1. Define**](define.md) | Describe the work: chain, contract, function, args, value, repeat. | No |
| [**2. Simulate**](simulate.md) | Validate, check balances, estimate gas, detect reverts, compute the executable count. | No |
| [**3. Execute**](execute.md) | After you approve, submit transactions sequentially with nonce management and retries. | Yes |
| [**4. Observe**](observe.md) | Report confirmed / failed / pending, total and average gas, and per-transaction records. | No |

## Why the stages are separate

The separation is deliberate and is the source of Foop's safety guarantees:

* **Simulation is free and repeatable.** You can iterate on a workload as many
  times as you like without touching your keys or spending gas.
* **Review is explicit.** Foop shows you the plan — how many transactions are
  executable and what constrains the rest — and waits for approval before
  execution.
* **Execution respects the plan.** Foop only submits the number of transactions
  the simulation deemed executable, never more.

## In the CLI

* `foop init` helps you **Define**.
* `foop simulate` runs **Simulate** and stops.
* `foop run` runs Simulate again, prompts for **Review**, then **Executes** and
  **Observes**.

Read on for a detailed look at each stage.
