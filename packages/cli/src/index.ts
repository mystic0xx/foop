#!/usr/bin/env node
import { argv, exit } from "node:process";

const [, , command, ...args] = argv;

async function main(): Promise<void> {
  switch (command) {
    case "simulate": {
      const { runSimulate } = await import("./commands/simulate.js");
      await runSimulate(args);
      break;
    }
    case "run": {
      const { runExecute } = await import("./commands/run.js");
      await runExecute(args);
      break;
    }
    case "init": {
      const { runInit } = await import("./commands/init.js");
      await runInit(args);
      break;
    }
    default: {
      console.log(
        [
          "",
          "  foop — on-chain workload runner",
          "",
          "  Usage:",
          "    foop simulate <workload.json>   Dry-run a workload (no signing)",
          "    foop run <workload.json>         Simulate then execute",
          "    foop init                        Scaffold a workload file",
          "",
          "  Environment:",
          "    FOOP_PRIVATE_KEY   Private key for signing (run only)",
          "    FOOP_RPC_URL       RPC endpoint override",
          "",
        ].join("\n")
      );
      exit(command ? 1 : 0);
    }
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`\n  Error: ${message}\n`);
  exit(1);
});
