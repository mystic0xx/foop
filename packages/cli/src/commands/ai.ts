import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import * as p from "@clack/prompts";
import { createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { planWorkload, WorkloadValidationError, isMainnet } from "@foop/core";
import type { WorkloadFile } from "@foop/core";
import { loadConfig } from "../config.js";
import { generateWorkload, AiCancelled } from "../ai/agent.js";
import { explainSimulation } from "../ai/summarize.js";
import { hasAiCredential, chainName } from "../ai/client.js";
import {
  printFoopBanner,
  printHeader,
  printDivider,
  printSimulationResult,
  printError,
  printInfo,
  printWarning,
} from "../renderer/progress.js";

export async function runAi(args: string[]): Promise<void> {
  printFoopBanner();
  p.intro("  foop ai — describe your workload in plain English");

  const config = loadConfig();

  if (!hasAiCredential()) {
    printWarning(
      "ANTHROPIC_API_KEY is not set. If you use `ant auth login` this may still work; otherwise set ANTHROPIC_API_KEY."
    );
  }

  // 1. Get the natural-language prompt (from args, or interactively).
  let prompt = args.join(" ").trim();
  if (!prompt) {
    const answer = await p.text({
      message: "What do you want to do?",
      placeholder: "Swap 10 times on 0x… on Base Sepolia",
    });
    if (p.isCancel(answer) || !String(answer).trim()) {
      cancelled();
      return;
    }
    prompt = String(answer).trim();
  }

  // 2. Run the AI agent to build a workload.
  let generated;
  try {
    generated = await generateWorkload({ prompt, model: config.aiModel });
  } catch (err: unknown) {
    if (err instanceof AiCancelled) {
      cancelled();
      return;
    }
    printError(aiErrorMessage(err));
    process.exit(1);
  }

  const file = generated.file as WorkloadFile;

  printHeader("PROPOSED WORKLOAD");
  console.log(`  Chain   ${chainName(file.chain)} (${file.chain})`);
  file.steps.forEach((s, i) => {
    console.log(
      `  Step ${i + 1}  ${s.function}  ×${s.repeat}  →  ${s.contract}`
    );
    if (s.args && s.args.length) console.log(`          args: ${JSON.stringify(s.args)}`);
    if (s.value && s.value !== "0") console.log(`          value: ${s.value} wei`);
  });
  if (generated.summary) {
    console.log("");
    console.log(`  ${generated.summary}`);
  }
  printDivider();

  // 3. Write the workload to a file.
  const outAnswer = await p.text({
    message: "Save workload to",
    placeholder: "workload.json",
    initialValue: "workload.json",
  });
  if (p.isCancel(outAnswer)) {
    cancelled();
    return;
  }
  const outPath = String(outAnswer || "workload.json");
  const absPath = resolve(process.cwd(), outPath);
  try {
    writeFileSync(absPath, JSON.stringify(file, null, 2) + "\n", "utf-8");
  } catch (err: unknown) {
    printError(
      `Could not write ${absPath}: ${err instanceof Error ? err.message : String(err)}`
    );
    process.exit(1);
  }
  printInfo(`Wrote ${outPath}`);

  // 4. Simulate + explain in plain English so the user knows what they'll sign.
  const rpcUrl = file.rpc ?? config.rpcUrl;
  if (!config.privateKey || !rpcUrl) {
    printDivider();
    console.log("  Next steps:");
    if (!rpcUrl) console.log("    set FOOP_RPC_URL (or add \"rpc\" to the file)");
    if (!config.privateKey) console.log("    set FOOP_PRIVATE_KEY to run");
    console.log(`    foop simulate ${outPath}`);
    console.log(`    foop run ${outPath}`);
    printDivider();
    return;
  }

  const account = privateKeyToAccount(config.privateKey);
  const publicClient = createPublicClient({ transport: http(rpcUrl) });

  let plan;
  const spinner = p.spinner();
  spinner.start("Simulating on-chain…");
  try {
    plan = await planWorkload({
      file,
      client: publicClient,
      walletAddress: account.address,
    });
    spinner.stop("Simulated.");
  } catch (err: unknown) {
    spinner.stop("Simulation failed.");
    if (err instanceof WorkloadValidationError) printError(err.message);
    else
      printError(
        `Simulation failed: ${err instanceof Error ? err.message : String(err)}`
      );
    console.log(`\n  The workload is saved at ${outPath} — fix and \`foop run ${outPath}\`.\n`);
    process.exit(1);
  }

  const stepLabels = file.steps.map(
    (s) => `${s.function}  ×${s.repeat}  ${s.contract.slice(0, 10)}…`
  );
  printSimulationResult(plan.simulation, stepLabels);

  // Plain-English explanation of what will be signed (best-effort).
  try {
    const explainSpin = p.spinner();
    explainSpin.start("Summarizing what you'll sign…");
    const explanation = await explainSimulation({
      file,
      simulation: plan.simulation,
      model: config.aiModel,
    });
    explainSpin.stop("");
    if (explanation) {
      printHeader("WHAT YOU'RE ABOUT TO SIGN");
      for (const line of explanation.split("\n")) console.log(`  ${line}`);
      printDivider();
    }
  } catch {
    // Non-fatal: the structured simulation above is authoritative.
  }

  const totalExecutable = plan.simulation.steps.reduce(
    (sum, s) => sum + s.executable,
    0
  );
  if (totalExecutable === 0) {
    printError("Nothing is executable right now. Aborting — nothing was signed.");
    process.exit(1);
  }

  // 5. Offer to execute through the guarded run pipeline.
  const doRun = await p.confirm({
    message: `Execute ${totalExecutable} transaction(s) now?`,
    initialValue: false,
  });
  if (p.isCancel(doRun) || !doRun) {
    console.log(`\n  Saved. Run it later with:  foop run ${outPath}\n`);
    return;
  }

  const { runExecute } = await import("./run.js");
  const runArgs = [outPath, "-y"];
  if (isMainnet(file.chain)) runArgs.push("--mainnet-i-understand");
  await runExecute(runArgs);
}

function cancelled(): void {
  console.log("\n  Cancelled.\n");
  process.exit(0);
}

function aiErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const status = (err as { status?: number } | null)?.status;
  if (status === 401 || status === 403 || /api key|authentication|401|403|x-api-key/i.test(msg)) {
    return (
      "Anthropic auth failed — set a valid ANTHROPIC_API_KEY (or run `ant auth login`).\n  " +
      `Details: ${msg}`
    );
  }
  return msg;
}
