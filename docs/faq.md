# FAQ

## Does Foop hold my private key?

No. Foop is non-custodial. The web UI signs through your browser wallet; the CLI
signs locally with the key in `FOOP_PRIVATE_KEY`. Foop stores no keys. See
[Safety & guardrails](concepts/safety-and-guardrails.md).

## Can Foop run more transactions than I asked for?

No. The `repeat` count is a hard upper bound. Foop executes
`min(requested, maxByGas, maxByValue, maxByToken)` per step and never more —
balance constraints only ever lower that number.

## Do I need a private key just to simulate?

No. `foop simulate` only needs an **address** to check balances. Set
`FOOP_WALLET_ADDRESS`, or let Foop derive the address from `FOOP_PRIVATE_KEY` if
it's set. Simulation never signs.

## Why is my simulation showing fewer executable transactions than requested?

Your wallet can't afford all of them given current state. Check the `blockedBy`
field: `eth_balance` (fees/value exceed your balance), `token_balance` (not
enough ERC-20), or `revert` (the call fails statically — see `revertReason`).

## Is `value` in ETH or wei?

**Wei**, as a string, in the workload file. `foop init` accepts ETH for
convenience and converts it. Hand-written files must use wei.

## What if the contract isn't verified?

Foop still works. If there's no verified ABI on Blockscout, it parses the
human-readable `function` signature, or you can embed an explicit `abi` field.
See [ABI resolution](reference/abi-resolution.md).

## Which chains are supported?

Any EIP-155 chain with a matching RPC URL. `foop init` presets, friendly names,
and automatic ABI lookup are enhanced for a specific set — see
[Supported chains](reference/supported-chains.md).

## How do I run against a mainnet?

`foop run` refuses mainnet chains unless you pass `--mainnet-i-understand`. This
is intentional friction. Be sure you mean it, and prefer a testnet while
iterating.

## Can I use Foop in CI?

Yes. `foop simulate` exits **0** when a workload is fully executable and **1**
when it's constrained — use it as a gate. `foop run --yes` skips the interactive
prompt for automated execution.

## Are transactions sent in parallel?

No. Execution is **sequential** — one transaction at a time, waiting for each
receipt. This keeps nonce handling predictable and progress legible. See
[Nonce management & execution](concepts/execution.md).

## What happens when a transaction fails mid-run?

It's recorded (with its hash and reason) and execution continues. A single
failure never aborts the rest of the run. The final summary reports confirmed /
failed / pending counts.

## Can I run multiple different calls in one workload?

Yes. Add multiple entries to `steps`; they execute in array order. See
[Define](lifecycle/define.md).
