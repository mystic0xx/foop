# Use cases

Foop shines whenever you'd otherwise write a throwaway script to fire the same
transaction many times. A few concrete scenarios:

## Protocol testing

Exercise your contracts with realistic call volume before an audit or launch.
Define the interaction once, repeat it hundreds of times, and confirm behavior
under sustained activity.

## Testnet seeding

A freshly deployed protocol on a testnet is empty. Seed it with deposits,
swaps, mints, or votes so the app, indexer, and dashboards have something real
to work against.

## Indexer & subgraph development

Generate a controlled stream of events to index. Because a workload is
deterministic and committed to version control, you can regenerate the exact
same event shape whenever you need to re-test your indexer.

## Analytics & QA

Produce known-quantity, known-shape on-chain data — N transfers of a fixed
amount, M deposits — so analytics pipelines and QA suites have predictable
inputs to assert against.

## Frontend & demo environments

Give a staging or demo frontend a populated chain to render: balances,
histories, positions. No more empty tables in screenshots.

## Reproducing protocol states

Recreate a specific on-chain state by replaying a sequence of calls. Commit the
workload alongside a bug report so anyone can reproduce the state deterministically.

## Load testing & throughput checks

Push a burst of transactions through a contract or an RPC endpoint to observe
gas behavior and confirmation characteristics under volume.

---

Across all of these, the value is the same: **describe the work once, simulate
it safely, and run it repeatably** — instead of maintaining a pile of one-off
scripts.
