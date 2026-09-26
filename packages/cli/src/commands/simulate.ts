import { createPublicClient, http } from "viem";
import {
  planWorkload,
  WorkloadValidationError,
  hasInputs,
  applyWorkloadInputs,
  planApproval,
  readAllowance,
} from "@foop/core";
import type { WorkloadFile } from "@foop/core";
import { loadConfig } from "../config.js";
import { resolveWorkloadArg } from "../store.js";
import { promptWorkloadInputs } from "../inputs.js";
import {
  printError,
  printHeader,
  printSimulationResult,
  printWarning,
  printInfo,
  printSuccess,
  printLargeWorkloadWarning,
  printMainnetWarning,
  printDivider,
} from "../renderer/progress.js";

// ---------------------------------------------------------------------------
// Chain metadata for display
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

export async function runSimulate(args: string[]): Promise<void> {
  const filePath = args[0];
  if (!filePath) {
    printError("Usage: foop simulate <workload.json>");
    process.exit(1);
  }

  // 1. Load config + workload file (a path or a saved name)
  const config = loadConfig();
  let raw: unknown;
  try {
    raw = resolveWorkloadArg(filePath).file;
  } catch (err: unknown) {
    printError(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  let file = raw as WorkloadFile;

  // 2. Resolve RPC URL
  const rpcUrl = file.rpc ?? config.rpcUrl;
  if (!rpcUrl) {
    printError(
      "No RPC URL found. Set FOOP_RPC_URL env var or add a \"rpc\" field to your workload file."
    );
    process.exit(1);
  }

  // 3. Resolve wallet address for simulation
  //    For simulate, a real address is needed for balance checks.
  //    Accept FOOP_WALLET_ADDRESS or derive from private key if available.
  const walletAddress =
    (process.env.FOOP_WALLET_ADDRESS as `0x${string}` | undefined) ??
    (await deriveAddressFromKey(config.privateKey));

  if (!walletAddress) {
    printError(
      "No wallet address found. Set FOOP_WALLET_ADDRESS or FOOP_PRIVATE_KEY so Foop can check your balances."
    );
    process.exit(1);
  }

  // 4. Build viem public client
  const client = createPublicClient({
    transport: http(rpcUrl),
  });

  // 4b. Interactive inputs — prompt + substitute so the simulation reflects the
  //     real amount / count the user intends to run.
  let inputs: Awaited<ReturnType<typeof promptWorkloadInputs>> | null = null;
  if (hasInputs(file)) {
    try {
      inputs = await promptWorkloadInputs(file, client);
    } catch (err: unknown) {
      printError(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
    file = applyWorkloadInputs(file, {
      amountWei: inputs.amountWei,
      count: inputs.count,
      recipient: walletAddress,
    });
  }

  // 4c. If an approval is configured and the current allowance is short, note
  //     that `foop run` will approve first. Per-step simulation evaluates the
  //     swap against *current* state, so it may show a transferFrom revert here.
  if (inputs) {
    try {
      const approvalPlan = planApproval(file, inputs);
      if (approvalPlan) {
        const current = await readAllowance(
          client,
          approvalPlan.token,
          walletAddress,
          approvalPlan.spender
        );
        if (current < approvalPlan.required) {
          printInfo(
            `foop run will approve ${approvalPlan.token} → ${approvalPlan.spender} before executing. ` +
              `Steps that pull this token may show as reverting below because the allowance isn't set yet.`
          );
        }
      }
    } catch {
      // Approval note is best-effort; ignore resolution errors here.
    }
  }

  // 5. Run planner (validate + simulate)
  printHeader(`FOOP SIMULATE  ${chainName(file.chain)}`);
  console.log(`  ${file.steps.length} step(s)  ·  ${filePath}\n`);

  let plan;
  try {
    plan = await planWorkload({ file, client, walletAddress });
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

  // 6. Print validation warnings
  for (const w of plan.validation.warnings) {
    printWarning(w.message);
  }

  // 7. Mainnet notice (informational in simulate mode)
  if (plan.isMainnet) {
    printMainnetWarning(
      plan.simulation.steps.reduce((sum, s) => sum + s.executable, 0)
    );
  }

  // 8. Large workload notice
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

  // 10. Exit code
  if (plan.simulation.fullyExecutable) {
    printSuccess(
      `All ${totalRequested} transaction(s) are executable. Run \`foop run ${filePath}\` to execute.`
    );
    printDivider();
    process.exit(0);
  } else {
    const totalExecutable = plan.simulation.steps.reduce(
      (sum, s) => sum + s.executable,
      0
    );
    console.log(
      `  Only ${totalExecutable} of ${totalRequested} transaction(s) can be executed given current balances.`
    );
    console.log(
      `  Run \`foop run ${filePath}\` to approve and execute the reduced workload.`
    );
    printDivider();
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Derives an Ethereum address from a hex private key using pure math.
 * Avoids importing a full wallet library just for simulate.
 */
async function deriveAddressFromKey(
  privateKey: `0x${string}` | undefined
): Promise<`0x${string}` | undefined> {
  if (!privateKey) return undefined;
  try {
    const { privateKeyToAccount } = await import("viem/accounts");
    return privateKeyToAccount(privateKey).address;
  } catch {
    return undefined;
  }
}
