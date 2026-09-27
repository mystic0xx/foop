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
    case "ai": {
      const { runAi } = await import("./commands/ai.js");
      await runAi(args);
      break;
    }
    case "save": {
      const { runSave } = await import("./commands/workloads.js");
      await runSave(args);
      break;
    }
    case "list": {
      const { runList } = await import("./commands/workloads.js");
      await runList();
      break;
    }
    case "show": {
      const { runShow } = await import("./commands/workloads.js");
      await runShow(args);
      break;
    }
    case "rm": {
      const { runRemove } = await import("./commands/workloads.js");
      await runRemove(args);
      break;
    }
    case "history": {
      const { runHistory } = await import("./commands/history.js");
      await runHistory(args);
      break;
    }
    case "templates": {
      const { runTemplates } = await import("./commands/templates.js");
      await runTemplates();
      break;
    }
    case "new": {
      const { runNew } = await import("./commands/templates.js");
      await runNew(args);
      break;
    }
    default: {
      // No command → interactive launcher. `help`/unknown → usage text.
      if (!command) {
        const { runMenu } = await import("./commands/menu.js");
        await runMenu();
        break;
      }
      const isHelp = command === "help" || command === "-h" || command === "--help";
      const { printFoopBanner } = await import("./renderer/progress.js");
      printFoopBanner();
      console.log(
        [
          "  foop — on-chain workload runner",
          "",
          "  Usage:",
          "    foop                             Interactive launcher (AI / provide / scaffold)",
          "    foop ai [prompt]                 Build a workload from plain English",
          "    foop simulate <workload|name>    Dry-run a workload (no signing)",
          "    foop run <workload|name>         Simulate then execute",
          "    foop init                        Scaffold a workload file",
          "",
          "  Saved workloads & history:",
          "    foop save <file.json> [name]     Save a workload to ~/.foop",
          "    foop list                        List saved workloads",
          "    foop show <name>                 Print a saved workload",
          "    foop rm <name>                   Delete a saved workload",
          "    foop history [name]              Show past run history",
          "",
          "  Templates:",
          "    foop templates                   List available templates",
          "    foop new <template> [name]       Create a workload from a template",
          "",
          "  Environment:",
          "    FOOP_PRIVATE_KEY   Private key for signing (run only)",
          "    FOOP_RPC_URL       RPC endpoint override",
          "    FOOP_HOME          Store location (default ~/.foop)",
          "    ANTHROPIC_API_KEY  API key for `foop ai`",
          "    FOOP_AI_MODEL      Model for `foop ai` (default claude-sonnet-5)",
          "",
        ].join("\n")
      );
      exit(isHelp ? 0 : 1);
    }
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`\n  Error: ${message}\n`);
  exit(1);
});
