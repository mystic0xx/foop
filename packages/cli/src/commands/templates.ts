import { loadTemplate, listTemplates } from "../templates.js";
import { saveWorkload } from "../store.js";
import {
  printError,
  printHeader,
  printSuccess,
  printInfo,
  printWarning,
} from "../renderer/progress.js";

// ---------------------------------------------------------------------------
// foop templates — list bundled + user templates
// ---------------------------------------------------------------------------

export async function runTemplates(): Promise<void> {
  const items = listTemplates();
  printHeader("TEMPLATES");
  const nameW = Math.max(4, ...items.map((i) => i.name.length));
  console.log(`  ${"NAME".padEnd(nameW)}   SOURCE    CHAIN    STEPS`);
  for (const i of items) {
    console.log(
      `  ${i.name.padEnd(nameW)}   ${i.source.padEnd(7)}   ${String(i.chain).padEnd(6)}   ${i.steps}`
    );
  }
  console.log("");
  printInfo("Create a workload from one:  foop new <template> [name]");
}

// ---------------------------------------------------------------------------
// foop new <template> [name] — instantiate a template into a saved workload
// ---------------------------------------------------------------------------

export async function runNew(args: string[]): Promise<void> {
  const positional = args.filter((a) => !a.startsWith("-"));
  const template = positional[0];
  if (!template) {
    printError("Usage: foop new <template> [name]");
    printInfo("List templates with: foop templates");
    process.exit(1);
  }

  const file = loadTemplate(template);
  if (!file) {
    printError(`No template named "${template}". Run \`foop templates\`.`);
    process.exit(1);
  }

  const name = positional[1] ?? template;
  let path: string;
  try {
    path = saveWorkload(name, file);
  } catch (err: unknown) {
    printError(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  printSuccess(`Created workload "${name}" from template "${template}"`);
  printInfo(path);

  // Warn if the template ships edit-me placeholder addresses.
  const raw = JSON.stringify(file);
  if (raw.includes("0xYOUR_")) {
    printWarning(
      `This template has placeholder addresses (0xYOUR_…). Edit them first:  foop show ${name}`
    );
  }
  printInfo(`Then:  foop simulate ${name}`);
}
