---
description: Stop writing scripts for throwaway on-chain workloads. Just Foop it.
---

# About Foop

## What is Foop?

Foop lets blockchain developers **define, simulate, and execute repeatable on-chain workloads** without writing one-off transaction scripts.

Seeding protocol activity, populating test environments, or reproducing a
transaction sequence shouldn't require a custom Foundry, viem, or ethers script
every time. Foop replaces the manual loop:

```
Explorer → click → sign → wait → repeat ×100
```

with a declarative, version-controllable one:

```
Define → Simulate → Review → Execute → Observe
```

## The core idea

A **workload** is a plain JSON file that describes a contract call and how many
times to run it. Foop reads that file, resolves the contract's ABI, simulates
every transaction against the live chain state, and tells you exactly how many
are executable before you sign anything. Only after you approve the plan does it
submit transactions — managing nonces, tracking receipts, and reporting the
outcome of every one.

{% hint style="info" %}
Foop **never holds private keys** on the web, and on the CLI it signs locally
with a key you supply through your environment. Simulation always runs before
execution, and the requested iteration count is a **hard upper bound** — Foop
will never silently run until your funds are exhausted.
{% endhint %}

## What Foop is good for

* **Protocol testing** — exercise your contracts with realistic call volume
* **Testnet seeding** — populate a fresh deployment with activity
* **Indexer & subgraph development** — generate events to index against
* **Analytics & QA** — produce known-shape data and load
* **Frontend & demo environments** — give staging apps something to render
* **Reproducing protocol states** — replay a sequence deterministically

## How this documentation is organized

| Section | What's inside |
|---|---|
| [Getting Started](getting-started/installation.md) | Install Foop and run your first workload |
| [The Workload Lifecycle](lifecycle/overview.md) | The Define → Simulate → Execute → Observe flow, in depth |
| [CLI Reference](cli/overview.md) | Every command, flag, and environment variable |
| [Reference](reference/workload-file.md) | The workload file schema and result shapes |
| [Concepts](concepts/safety-and-guardrails.md) | How the safety model, simulation, and execution work |
| [Packages](packages/core.md) | The `@foop/core` and `@foop/cli` internals |

## Project status

Foop is early software. The web UI (define → simulate → execute → observe) is
the V1 surface; the CLI described throughout these docs is **in active
development**. See the [Roadmap](roadmap.md) for what's shipped and what's next.
