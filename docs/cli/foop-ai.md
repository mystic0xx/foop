# foop ai

Describe a workload in plain English and let Claude build it for you. `foop ai`
turns a natural-language request into a concrete workload file, simulates it, and
explains — in plain English — exactly what you're about to sign before anything
is executed.

```bash
foop ai "deposit 0.01 ETH 10 times into 0x4200…0006 on Base Sepolia"

# or launch it interactively (prompts for the request)
foop ai
```

## What it does

1. **Understands the request.** The model maps your chain name to its id, pulls
   out the contract, amount, and repeat count, and identifies the action.
2. **Looks up the real function.** Given the chain and address, it resolves the
   contract's ABI (via [ABI resolution](../reference/abi-resolution.md)) and picks
   the matching writable function instead of guessing a signature.
3. **Asks for anything missing.** If it can't infer a value — an address, an
   amount, which of several functions — it asks. It never invents addresses or
   token amounts.
4. **Proposes the workload.** It prints the chain, each step, and a one-line
   summary, then writes the workload to a file you choose (default
   `workload.json`).
5. **Simulates and explains.** If `FOOP_PRIVATE_KEY` and an RPC URL are set, it
   runs the full [simulation](foop-simulate.md) and adds a plain-English **"what
   you're about to sign"** summary grounded in the real numbers.
6. **Executes on approval.** Only if transactions are executable does it offer to
   run them, through the same guarded [`foop run`](foop-run.md) pipeline (mainnet
   gate included). The confirmation defaults to **No**.

If no key or RPC is configured, `foop ai` stops after writing the file and prints
the `foop simulate` / `foop run` commands to continue later.

## Example

```
$ foop ai "deposit 0.01 eth 10 times on 0x4200000000000000000000000000000000000006 on base sepolia"

  PROPOSED WORKLOAD
  ───────────────────
  Chain   Base Sepolia (84532)
  Step 1  deposit()  ×10  →  0x4200000000000000000000000000000000000006
          value: 10000000000000000 wei

  Deposits 0.01 ETH into the WETH contract on Base Sepolia, repeated 10 times.

  … writes workload.json, simulates, then:

  WHAT YOU'RE ABOUT TO SIGN
  ───────────────────────────
  - Each transaction calls deposit() on the WETH contract, wrapping ETH into WETH.
  - All 10 requested transactions are executable — nothing is blocked.
  - Each sends 0.01 ETH; total native value is 0.1 ETH.
  - Estimated total fee ~0.0000027 ETH across all 10.

  Execute 10 transaction(s) now? › No / Yes
```

## Configuration

`foop ai` uses the Anthropic API. Credentials are read from the environment by
the Anthropic SDK:

* `ANTHROPIC_API_KEY` — a standard Anthropic key, **or**
* `ANTHROPIC_AUTH_TOKEN` + `ANTHROPIC_BASE_URL` — a token and endpoint for an
  Anthropic-compatible provider.

`FOOP_AI_MODEL` selects the model (default `claude-sonnet-5`). Simulation and
execution use the same `FOOP_RPC_URL` / `FOOP_PRIVATE_KEY` as the other commands
— see [Configuration](configuration.md).

The plain-English summary is best-effort: if that model call fails, the
structured [simulation result](../reference/simulation-result.md) still stands
and is authoritative.
