# Installation

Foop is a TypeScript monorepo managed with [pnpm](https://pnpm.io). It ships two
packages:

| Package        | Description                                                               |
| -------------- | ------------------------------------------------------------------------- |
| `@foop/core` | Simulation engine, workload planner, execution controller — shared logic |
| `@foop/cli`  | Terminal interface:`foop init`, `foop simulate`, `foop run`         |

## Requirements

* **Node.js** ≥ 20
* **pnpm** ≥ 9

## From source

Until Foop is published to a registry, install and build from the repository.

```bash
git clone <repo-url> foop
cd foop
pnpm install
pnpm build
```

`pnpm build` compiles `@foop/core` first, then bundles the CLI to a single
executable file at `packages/cli/dist/index.js`.

## Running the CLI

From the repository root you can invoke the CLI through the workspace script:

```bash
pnpm foop            # prints usage
pnpm foop simulate workload.json
```

Or call the bundled entry point directly:

```bash
node packages/cli/dist/index.js simulate workload.json
```

{% hint style="info" %}
Throughout these docs commands are written as `foop <command>`. Substitute
`pnpm foop <command>` (or a shell alias) until a global `foop` binary is
published.
{% endhint %}

## Verify

```bash
pnpm foop
```

You should see the usage banner listing `simulate`, `run`, and `init`.

## Next

Head to the [Quickstart](quickstart.md) to define and simulate your first
workload.
