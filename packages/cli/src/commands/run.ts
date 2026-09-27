import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  planWorkload,
  executeWorkload,
  executeWorkloadStaged,
  WorkloadValidationError,
  isMainnet,
  hasInputs,
  applyWorkloadInputs,
  planApproval,
  readAllowance,
} from "@foop/core";
import type { WorkloadFile, WorkloadStep, TxRecord } from "@foop/core";
import { loadConfig } from "../config.js";
import { resolveWorkloadArg, appendHistory } from "../store.js";
import { promptWorkloadInputs } from "../inputs.js";
import {
  printError,
  printHeader,
  printSimulationResult,
  printWarning,
  printInfo,
  printApprovePlan,
  printMainnetWarning,
  printLargeWorkloadWarning,
  printProgress,
  clearProgressLine,
  printTxLine,
  printExecutionSummary,
  printDivider,
  printStagedStep,
  printStagingNotice,
} from "../renderer/progress.js";

// ---------------------------------------------------------------------------
// Chain names (shared with simulate)
// ---------------------------------------------------------------------------

const CHAIN_NAMES: Record<number, string> = {
  1: "Ethereum Mainnet",
  10: "Optimism",
  8453: "Base",
  84532: "Base Sepolia",
  42161: "Arbitrum One",
  137: "Polygon",
  11155111: "Sepolia",
  31337: "Anvil / Hardhat",
};

function chainName(id: number): string {
  return CHAIN_NAMES[id] ?? `Chain ${id}`;
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export async function runExecute(args: string[]): Promise<void> {
  const filePath = args[0];
  const skipConfirm = args.includes("--yes") || args.includes("-y");
  const mainnetAck = args.includes("--mainnet-i-understand");
  const noStaged = args.includes("--no-staged");

  if (!filePath) {
    printError(
      "Usage: foop run <workload.json> [--yes] [--no-staged] [--mainnet-i-understand]"
    );
    process.exit(1);
  }

  // 1. Load config
  const config = loadConfig();
  if (!config.privateKey) {
    printError(
      "FOOP_PRIVATE_KEY is required for foop run. Set it in your environment."
    );
    process.exit(1);
  }

  // 2. Load workload file (a path or a saved name)
  let raw: WorkloadFile;
  let sourceLabel = filePath;
  try {
    const resolved = resolveWorkloadArg(filePath);
    raw = resolved.file;
    sourceLabel = resolved.source;
  } catch (err: unknown) {
    printError(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
  let file = raw as WorkloadFile;

  // 3. Resolve RPC
  const rpcUrl = file.rpc ?? config.rpcUrl;
  if (!rpcUrl) {
    printError(
      'No RPC URL found. Set FOOP_RPC_URL env var or add a "rpc" field to your workload file.'
    );
    process.exit(1);
  }

  // 4. Build account + clients
  const account = privateKeyToAccount(config.privateKey);
  const transport = http(rpcUrl);
  const publicClient = createPublicClient({ transport });
  const walletClient = createWalletClient({ account, transport });

  printHeader(`FOOP RUN  ${chainName(file.chain)}`);
  console.log(`  Wallet  ${account.address}`);
  console.log(`  File    ${filePath}\n`);

  // 5. Interactive inputs — prompt + substitute {amount}/{count} before anything else.
  let inputs: Awaited<ReturnType<typeof promptWorkloadInputs>> | null = null;
  if (hasInputs(file)) {
    try {
      inputs = await promptWorkloadInputs(file, publicClient);
    } catch (err: unknown) {
      printError(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
    file = applyWorkloadInputs(file, {
      amountWei: inputs.amountWei,
      count: inputs.count,
      recipient: account.address,
    });
  }

  // 6. Mainnet gate
  if (isMainnet(file.chain) && !mainnetAck) {
    printMainnetWarning(
      file.steps.reduce((sum, s) => sum + Number(s.repeat), 0)
    );
    console.log(
      "  Add --mainnet-i-understand to confirm you want to proceed.\n"
    );
    process.exit(1);
  }

  // 7. Auto-approve — ensure the ERC-20 allowance the workload needs exists.
  //    When short, the approve tx executes FIRST so the subsequent simulation
  //    reflects real state (no false transferFrom reverts).
  let confirmed = false;
  if (inputs) {
    let approvalPlan;
    try {
      approvalPlan = planApproval(file, inputs);
    } catch (err: unknown) {
      printError(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }

    if (approvalPlan) {
      const current = await readAllowance(
        publicClient,
        approvalPlan.token,
        account.address,
        approvalPlan.spender
      );
      printApprovePlan({
        token: approvalPlan.token,
        spender: approvalPlan.spender,
        required: approvalPlan.required,
        current,
        decimals: inputs.decimals,
      });

      if (current < approvalPlan.required) {
        if (!skipConfirm) {
          const ok = await promptConfirm(
            "  Approve now, then simulate and execute the workload? [y/n] "
          );
          if (!ok) {
            console.log("\n  Aborted.\n");
            process.exit(0);
          }
          confirmed = true; // don't ask again before executing the steps
        }

        const approveStep: WorkloadStep = {
          contract: approvalPlan.token,
          function: "approve(address,uint256)",
          args: [approvalPlan.spender, approvalPlan.required.toString()],
          repeat: 1,
        };

        printHeader("APPROVING");
        const approveResult = await executeWorkload({
          client: publicClient,
          wallet: walletClient,
          account,
          steps: [approveStep],
          executableCounts: [1],
          chainId: file.chain,
          onSettle: (record: TxRecord) => {
            printTxLine({
              index: 1,
              total: 1,
              hash: record.hash,
              status: record.status,
              gasUsed: record.gasUsed,
              failureReason: record.failureReason,
            });
          },
        });
        if (approveResult.failed > 0 || approveResult.confirmed === 0) {
          printError("Approval transaction failed. Aborting before execution.");
          process.exit(1);
        }
        console.log("");
      } else {
        printInfo("Sufficient allowance already set — skipping approval.");
      }
    }
  }

  // 8. Simulate

  let plan;
  try {
    plan = await planWorkload({
      file,
      client: publicClient,
      walletAddress: account.address,
    });
  } catch (err: unknown) {
    if (err instanceof WorkloadValidationError) {
      printError(err.message);
    } else {
      printError(
        `Simulation failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
    process.exit(1);
  }

  // 9. Validation warnings
  for (const w of plan.validation.warnings) {
    printWarning(w.message);
  }

  // 10. Large workload warning
  const totalRequested = plan.simulation.steps.reduce(
    (sum, s) => sum + s.requested,
    0
  );
  if (totalRequested > 500) {
    printLargeWorkloadWarning(totalRequested);
  }

  // 11. Render simulation result
  //
  // Staged execution is the default for any workload with more than one step:
  // each step is re-simulated against live chain state right before it runs, so
  // a dependent step (borrow after supply) is only checked once its
  // preconditions exist. Single-step workloads keep the up-front path.
  const staged = file.steps.length > 1 && !noStaged;

  const stepLabels = file.steps.map(
    (s) => `${s.function}  ×${s.repeat}  ${s.contract.slice(0, 10)}…`
  );
  printSimulationResult(plan.simulation, stepLabels, staged);

  const totalExecutable = plan.simulation.steps.reduce(
    (sum, s) => sum + s.executable,
    0
  );

  if (staged) {
    // Only the first step is simulated against real current state; later steps
    // may show 0 because their preconditions don't exist yet (that's expected
    // and re-checked live). Abort only when step 0 itself can't start.
    if ((plan.simulation.steps[0]?.executable ?? 0) === 0) {
      printError("The first step is not executable against current state. Aborting.");
      process.exit(1);
    }
  } else if (totalExecutable === 0) {
    printError("No transactions are executable. Aborting.");
    process.exit(1);
  }

  // 12. Confirmation prompt (skipped when already confirmed at the approval step)
  if (!skipConfirm && !confirmed) {
    let ok: boolean;
    if (staged) {
      printStagingNotice();
      ok = await promptConfirm(
        `  Execute up to ${totalRequested} transaction(s) across ${file.steps.length} steps? ` +
          `Each step is re-checked live and signed only if ready. [y/n] `
      );
    } else {
      ok = await promptConfirm(`  Execute ${totalExecutable} transaction(s)? [y/n] `);
    }
    if (!ok) {
      console.log("\n  Aborted.\n");
      process.exit(0);
    }
  }

  // 13. Execute
  printHeader("EXECUTING");

  // Denominator for the progress bar: the up-front executor knows exactly how
  // many will run; the staged executor can only bound it by the requested total.
  const progressTotal = staged ? totalRequested : totalExecutable;
  let doneCount = 0;

  let result;
  if (staged) {
    result = await executeWorkloadStaged({
      client: publicClient,
      wallet: walletClient,
      account,
      steps: file.steps,
      chainId: file.chain,
      onStep: (info) => {
        clearProgressLine();
        printStagedStep({
          stepIndex: info.stepIndex,
          totalSteps: file.steps.length,
          label: stepLabels[info.stepIndex] ?? `Step ${info.stepIndex + 1}`,
          requested: info.requested,
          executable: info.executable,
          halted: info.halted,
          blockedBy: info.blockedBy,
          revertReason: info.revertReason,
        });
        if (!info.halted) printProgress(doneCount, progressTotal);
      },
      onSubmit: ({ hash }) => {
        void hash;
      },
      onSettle: (record: TxRecord) => {
        doneCount++;
        clearProgressLine();
        printTxLine({
          index: doneCount,
          total: progressTotal,
          hash: record.hash,
          status: record.status,
          gasUsed: record.gasUsed,
          failureReason: record.failureReason,
        });
        printProgress(doneCount, progressTotal, record.hash);
      },
    });
  } else {
    const executableCounts = plan.simulation.steps.map((s) => s.executable);
    printProgress(0, progressTotal);

    result = await executeWorkload({
      client: publicClient,
      wallet: walletClient,
      account,
      steps: file.steps,
      executableCounts,
      chainId: file.chain,
      onSubmit: ({ hash }) => {
        // hash known, receipt pending — progress bar stays until settled
        void hash;
      },
      onSettle: (record: TxRecord) => {
        doneCount++;
        clearProgressLine();
        printTxLine({
          index: doneCount,
          total: progressTotal,
          hash: record.hash,
          status: record.status,
          gasUsed: record.gasUsed,
          failureReason: record.failureReason,
        });
        printProgress(doneCount, progressTotal, record.hash);
      },
    });
  }

  clearProgressLine();
  printDivider();

  if (result.haltReason) {
    printWarning(result.haltReason);
  }
  if (result.skipped && result.skipped > 0) {
    printInfo(`${result.skipped} iteration(s) not run (skipped or funds-capped).`);
  }

  // Record this run in history (best-effort — never aborts on write failure).
  appendHistory({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ts: new Date().toISOString(),
    source: sourceLabel,
    chain: file.chain,
    wallet: account.address,
    requested: progressTotal,
    confirmed: result.confirmed,
    failed: result.failed,
    totalGasUsed: result.totalGasUsed.toString(),
    txHashes: result.transactions
      .map((t) => t.hash)
      .filter((h) => !/^0x0+$/.test(h)),
  });

  // 14. Summary
  printExecutionSummary({
    confirmed: result.confirmed,
    failed: result.failed,
    pending: result.pending,
    totalGasUsed: result.totalGasUsed,
    total: progressTotal,
  });

  process.exit(result.failed > 0 ? 1 : 0);
}

// ---------------------------------------------------------------------------
// Simple stdin confirmation prompt
// ---------------------------------------------------------------------------

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
