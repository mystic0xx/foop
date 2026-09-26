import { basename } from "node:path";
import type { WorkloadFile } from "@foop/core";
import { readWorkloadFile } from "../config.js";
import {
  assertWorkloadShape,
  listWorkloads,
  loadWorkload,
  removeWorkload,
  saveWorkload,
} from "../store.js";
import {
  printError,
  printHeader,
  printSuccess,
  printInfo,
} from "../renderer/progress.js";
import { saveTemplate } from "../templates.js";

// ---------------------------------------------------------------------------
// foop save <file> [name] [--as-template <name>]
// ---------------------------------------------------------------------------

export async function runSave(args: string[]): Promise<void> {
  const positional = args.filter((a) => !a.startsWith("-"));
  const filePath = positional[0];
  if (!filePath) {
    printError("Usage: foop save <file.json> [name] [--as-template <name>]");
    process.exit(1);
  }

  let file: WorkloadFile;
  try {
    file = readWorkloadFile(filePath) as WorkloadFile;
    assertWorkloadShape(file);
  } catch (err: unknown) {
    printError(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  const templateFlag = args.indexOf("--as-template");
  const asTemplate = templateFlag !== -1;
  const defaultName = basename(filePath).replace(/\.json$/i, "");

  try {
    if (asTemplate) {
      const name = args[templateFlag + 1] ?? positional[1] ?? defaultName;
      const path = saveTemplate(name, file);
      printSuccess(`Saved template "${name}"`);
      printInfo(`Instantiate with: foop new ${name}`);
      printInfo(path);
    } else {
      const name = positional[1] ?? defaultName;
      const path = saveWorkload(name, file);
      printSuccess(`Saved workload "${name}"`);
      printInfo(`Run with: foop simulate ${name}  ·  foop run ${name}`);
      printInfo(path);
    }
  } catch (err: unknown) {
    printError(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// foop list
// ---------------------------------------------------------------------------

export async function runList(): Promise<void> {
  const items = listWorkloads();
  printHeader("SAVED WORKLOADS");
  if (items.length === 0) {
    console.log("  (none yet — save one with `foop save <file.json>`)\n");
    return;
  }
  const nameW = Math.max(4, ...items.map((i) => i.name.length));
  console.log(`  ${"NAME".padEnd(nameW)}   CHAIN    STEPS`);
  for (const i of items) {
    console.log(
      `  ${i.name.padEnd(nameW)}   ${String(i.chain).padEnd(6)}   ${i.steps}`
    );
  }
  console.log("");
}

// ---------------------------------------------------------------------------
// foop show <name>
// ---------------------------------------------------------------------------

export async function runShow(args: string[]): Promise<void> {
  const name = args[0];
  if (!name) {
    printError("Usage: foop show <name>");
    process.exit(1);
  }
  const file = loadWorkload(name);
  if (!file) {
    printError(`No saved workload named "${name}". Run \`foop list\`.`);
    process.exit(1);
  }
  console.log(JSON.stringify(file, null, 2));
}

// ---------------------------------------------------------------------------
// foop rm <name> [--yes]
// ---------------------------------------------------------------------------

export async function runRemove(args: string[]): Promise<void> {
  const name = args.find((a) => !a.startsWith("-"));
  if (!name) {
    printError("Usage: foop rm <name> [--yes]");
    process.exit(1);
  }
  const skipConfirm = args.includes("--yes") || args.includes("-y");
  if (!loadWorkload(name)) {
    printError(`No saved workload named "${name}".`);
    process.exit(1);
  }
  if (!skipConfirm) {
    const ok = await promptConfirm(`  Delete saved workload "${name}"? [y/n] `);
    if (!ok) {
      console.log("\n  Aborted.\n");
      return;
    }
  }
  removeWorkload(name);
  printSuccess(`Removed "${name}"`);
}

function promptConfirm(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    process.stdout.write(question);
    process.stdin.setEncoding("utf-8");
    process.stdin.resume();
    process.stdin.once("data", (data: string) => {
      process.stdin.pause();
      resolve(data.trim().toLowerCase() === "y");
    });
  });
}
