import * as p from "@clack/prompts";
import { printFoopBanner, printError } from "../renderer/progress.js";

/**
 * Interactive launcher shown when `foop` is run with no command. Routes to the
 * three ways to start a workload: bring your own JSON, describe it to the AI,
 * or scaffold one step by step.
 */
export async function runMenu(): Promise<void> {
  printFoopBanner();

  // The launcher is interactive; without a TTY (piped/CI) point at the commands.
  if (!process.stdin.isTTY) {
    console.log(
      "  foop — run `foop help` for commands, or `foop ai \"<prompt>\"` to build a workload.\n"
    );
    process.exit(0);
  }

  p.intro("  foop — on-chain workload runner");

  const choice = await p.select({
    message: "How do you want to start?",
    options: [
      {
        value: "ai",
        label: "Use foop AI",
        hint: "describe it in plain English",
      },
      {
        value: "provide",
        label: "Provide a workload",
        hint: "bring your own populated JSON",
      },
      {
        value: "init",
        label: "Scaffold a workload",
        hint: "guided step-by-step builder",
      },
      { value: "exit", label: "Exit", hint: "" },
    ],
  });

  if (p.isCancel(choice) || choice === "exit") {
    console.log("\n  Bye.\n");
    process.exit(0);
  }

  if (choice === "ai") {
    const { runAi } = await import("./ai.js");
    await runAi([]);
    return;
  }

  if (choice === "init") {
    const { runInit } = await import("./init.js");
    await runInit([]);
    return;
  }

  // choice === "provide"
  const pathAnswer = await p.text({
    message: "Path to your workload JSON (or a saved workload name)",
    placeholder: "workload.json",
  });
  if (p.isCancel(pathAnswer) || !String(pathAnswer).trim()) {
    console.log("\n  Cancelled.\n");
    process.exit(0);
  }
  const target = String(pathAnswer).trim();

  const action = await p.select({
    message: "What next?",
    options: [
      { value: "run", label: "Simulate then run", hint: "signs & executes" },
      { value: "simulate", label: "Simulate only", hint: "dry-run, no signing" },
    ],
  });
  if (p.isCancel(action)) {
    console.log("\n  Cancelled.\n");
    process.exit(0);
  }

  if (action === "simulate") {
    const { runSimulate } = await import("./simulate.js");
    await runSimulate([target]);
  } else {
    const { runExecute } = await import("./run.js");
    await runExecute([target]);
  }
}

// Re-exported for callers that only need to signal an unknown command.
export function usageError(command: string): void {
  printError(`Unknown command "${command}". Run \`foop\` for the menu or \`foop help\`.`);
}
