import {
  type Address,
  type PublicClient,
  encodeFunctionData,
} from "viem";
import { resolveAbi } from "./abi-resolver.js";
import type {
  BlockedByReason,
  SimulationResult,
  StepSimulation,
  WorkloadStep,
} from "./types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Gas estimate safety multiplier (1.2×) applied as integer math: × 12 / 10 */
const GAS_BUFFER_NUM = 12n;
const GAS_BUFFER_DEN = 10n;

/** ERC-20 ABI fragments needed for balance + allowance checks. */
const ERC20_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function applyGasBuffer(estimate: bigint): bigint {
  return (estimate * GAS_BUFFER_NUM) / GAS_BUFFER_DEN;
}

function safeMin(...values: (number | null)[]): number {
  const defined = values.filter((v): v is number => v !== null);
  return Math.min(...defined);
}

/**
 * Detects if a function signature looks like a transferFrom call,
 * which implies an ERC-20 allowance check is needed.
 */
function isTransferFrom(sig: string): boolean {
  return sig.toLowerCase().includes("transferfrom");
}

// ---------------------------------------------------------------------------
// Simulate a single step
// ---------------------------------------------------------------------------

export interface SimulateStepOptions {
  client: PublicClient;
  walletAddress: Address;
  step: WorkloadStep;
  stepIndex: number;
  nativeBalance: bigint;
  baseFee: bigint;
  priorityFee: bigint;
}

export async function simulateStep(
  opts: SimulateStepOptions
): Promise<StepSimulation> {
  const {
    client,
    walletAddress,
    step,
    stepIndex,
    nativeBalance,
    baseFee,
    priorityFee,
  } = opts;

  const valuePerTx = step.value ? BigInt(step.value) : 0n;
  const requested = step.repeat;

  // 1. Resolve ABI
  const { abi } = await resolveAbi({
    chainId: await client.getChainId(),
    address: step.contract,
    functionSignature: step.function,
    providedAbi: step.abi,
  });

  // 2. Encode calldata
  const functionName = step.function.split("(")[0].trim();
  const data = encodeFunctionData({
    abi,
    functionName,
    args: step.args ?? [],
  });

  // 3. eth_call — revert detection on first iteration
  let revertReason: string | undefined;
  try {
    await client.call({
      account: walletAddress,
      to: step.contract as Address,
      data,
      value: valuePerTx,
    });
  } catch (err: unknown) {
    revertReason = err instanceof Error ? err.message : String(err);
    // A revert means 0 executable iterations
    return {
      stepIndex,
      requested,
      gasPerTx: 0n,
      valuePerTx,
      feePerTx: 0n,
      maxByGas: 0,
      maxByValue: valuePerTx > 0n ? 0 : null,
      maxByToken: null,
      executable: 0,
      blockedBy: "revert",
      stateDependentWarning: false,
      revertReason,
    };
  }

  // 4. eth_estimateGas with buffer
  let rawGasEstimate: bigint;
  try {
    rawGasEstimate = await client.estimateGas({
      account: walletAddress,
      to: step.contract as Address,
      data,
      value: valuePerTx,
    });
  } catch {
    rawGasEstimate = 300_000n; // conservative fallback
  }
  const gasPerTx = applyGasBuffer(rawGasEstimate);

  // 5. Fee per transaction (no floating point — all bigint)
  const effectiveGasPrice = baseFee + priorityFee;
  const feePerTx = gasPerTx * effectiveGasPrice;

  // 6. Max iterations by gas budget
  const costPerTx = feePerTx + valuePerTx;
  const maxByGas =
    costPerTx > 0n
      ? Number(nativeBalance / costPerTx)
      : requested;

  // 7. Max iterations by native value
  const maxByValue: number | null =
    valuePerTx > 0n
      ? Number(nativeBalance / (valuePerTx + feePerTx))
      : null;

  // 8. ERC-20 token balance check (for transferFrom-style calls)
  let maxByToken: number | null = null;
  if (isTransferFrom(step.function) && step.args && step.args.length >= 3) {
    // transferFrom(address from, address to, uint256 amount) — token is the contract
    const tokenAmount = BigInt(step.args[2]);
    if (tokenAmount > 0n) {
      try {
        const tokenBalance = await client.readContract({
          address: step.contract as Address,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [walletAddress],
        });
        maxByToken = Number(tokenBalance / tokenAmount);
      } catch {
        // Not a standard ERC-20 or call failed — skip token check
      }
    }
  }

  // 9. Compute final executable count
  const executable = Math.min(
    requested,
    safeMin(maxByGas, maxByValue, maxByToken)
  );

  // 10. Determine primary blocked-by reason
  let blockedBy: BlockedByReason = "none";
  if (executable < requested) {
    if (maxByToken !== null && executable >= maxByToken) {
      blockedBy = "token_balance";
    } else if (maxByValue !== null && maxByValue <= maxByGas) {
      blockedBy = "eth_balance";
    } else {
      blockedBy = "eth_balance";
    }
  }

  // 11. State-dependent warning: same contract + function writes state
  // Heuristic: non-view, non-pure functions that aren't simple value transfers
  const stateDependentWarning =
    requested > 1 &&
    !step.function.toLowerCase().includes("transfer(") &&
    !step.function.toLowerCase().includes("deposit()");

  return {
    stepIndex,
    requested,
    gasPerTx,
    valuePerTx,
    feePerTx,
    maxByGas,
    maxByValue,
    maxByToken,
    executable,
    blockedBy,
    stateDependentWarning,
    revertReason,
  };
}

// ---------------------------------------------------------------------------
// Simulate full workload
// ---------------------------------------------------------------------------

export interface SimulateWorkloadOptions {
  client: PublicClient;
  walletAddress: Address;
  steps: WorkloadStep[];
  chainId: number;
}

export async function simulateWorkload(
  opts: SimulateWorkloadOptions
): Promise<SimulationResult> {
  const { client, walletAddress, steps, chainId } = opts;

  // Validate RPC chain matches workload chain
  const rpcChainId = await client.getChainId();
  if (rpcChainId !== chainId) {
    throw new Error(
      `Chain mismatch: workload specifies chain ${chainId} but RPC returned chain ${rpcChainId}. ` +
        `Check your RPC URL or the "chain" field in your workload file.`
    );
  }

  // Fetch shared chain state once
  const [nativeBalance, feeData] = await Promise.all([
    client.getBalance({ address: walletAddress }),
    client.estimateFeesPerGas(),
  ]);

  const baseFee = feeData.maxFeePerGas ?? 0n;
  const priorityFee = feeData.maxPriorityFeePerGas ?? 0n;

  // Simulate each step
  const stepResults: StepSimulation[] = [];
  for (let i = 0; i < steps.length; i++) {
    const result = await simulateStep({
      client,
      walletAddress,
      step: steps[i],
      stepIndex: i,
      nativeBalance,
      baseFee,
      priorityFee,
    });
    stepResults.push(result);
  }

  const fullyExecutable = stepResults.every(
    (s) => s.executable >= s.requested
  );

  return {
    walletAddress,
    chainId,
    steps: stepResults,
    fullyExecutable,
    nativeBalance,
    baseFee,
  };
}
