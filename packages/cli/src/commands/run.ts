import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  planWorkload,
  executeWorkload,
  WorkloadValidationError,
  isMainnet,
} from "@foop/core";
import type { WorkloadFile, TxRecord } from "@foop/core";
import { loadConfig, readWorkloadFile } from "../config.js";
import {
  printError,
  printHeader,
  printSimulationResult,
  printWarning,
  printMainnetWarning,
  printLargeWorkloadWarning,
  printProgress,
  clearProgressLine,
  printTxLine,
  printExecutionSummary,
  printDivider,
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

  if (!filePath) {
    printError("Usage: foop run <workload.json> [--yes] [--mainnet-i-understand]");
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

  // 2. Load workload file
  let raw: unknown;
  try {
    raw = readWorkloadFile(filePath);
  } catch (err: unknown) {
    printError(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
  const file = raw as WorkloadFile;

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

  // 5. Mainnet gate
  if (isMainnet(file.chain) && !mainnetAck) {
    printMainnetWarning(
      file.steps.reduce((sum, s) => sum + s.repeat, 0)
    );
    console.log(
      "  Add --mainnet-i-understand to confirm you want to proceed.\n"
    );
    process.exit(1);
  }

  // 6. Simulate
  printHeader(`FOOP RUN  ${chainName(file.chain)}`);
  console.log(`  Wallet  ${account.address}`);
  console.log(`  File    ${filePath}\n`);

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

  // 7. Validation warnings
  for (const w of plan.validation.warnings) {
    printWarning(w.message);
  }

  // 8. Large workload warning
  const totalRequested = plan.simulation.steps.reduce(
    (sum, s) => sum + s.requested,
    0
  );
  if (totalRequested > 500) {
    printLargeWorkloadWarning(totalRequested);
  }

  // 9. Render simulation result
  const stepLabels = file.steps.map(
    (s) => `${s.function}  ×${s.repeat}  ${s.contract.slice(0, 10)}…`
  );
  printSimulationResult(plan.simulation, stepLabels);

  const totalExecutable = plan.simulation.steps.reduce(
    (sum, s) => sum + s.executable,
    0
  );

  if (totalExecutable === 0) {
    printError("No transactions are executable. Aborting.");
    process.exit(1);
  }

  // 10. Confirmation prompt
  if (!skipConfirm) {
    const confirmed = await promptConfirm(
      `  Execute ${totalExecutable} transaction(s)? [y/N] `
    );
    if (!confirmed) {
      console.log("\n  Aborted.\n");
      process.exit(0);
    }
  }

  // 11. Execute
  printHeader("EXECUTING");

  const executableCounts = plan.simulation.steps.map((s) => s.executable);
  let doneCount = 0;

  printProgress(0, totalExecutable);

  const result = await executeWorkload({
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
        total: totalExecutable,
        hash: record.hash,
        status: record.status,
        gasUsed: record.gasUsed,
        failureReason: record.failureReason,
      });
      printProgress(doneCount, totalExecutable, record.hash);
    },
  });

  clearProgressLine();
  printDivider();

  // 12. Summary
  printExecutionSummary({
    confirmed: result.confirmed,
    failed: result.failed,
    pending: result.pending,
    totalGasUsed: result.totalGasUsed,
    total: totalExecutable,
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
