import { type PublicClient, getAddress } from "viem";
import type { Address } from "viem";
import { simulateWorkload } from "./simulation-engine.js";
import type { SimulationResult, WorkloadFile } from "./types.js";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class WorkloadValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkloadValidationError";
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const MAX_REPEAT = 10_000;
const LARGE_WORKLOAD_THRESHOLD = 500;

export interface ValidationWarning {
  stepIndex: number;
  message: string;
}

export interface ValidationResult {
  warnings: ValidationWarning[];
}

/**
 * Validates a parsed WorkloadFile and throws WorkloadValidationError on any
 * hard constraint violation. Soft warnings are returned.
 */
export function validateWorkload(file: WorkloadFile): ValidationResult {
  const warnings: ValidationWarning[] = [];

  if (file.version !== "1") {
    throw new WorkloadValidationError(
      `Unsupported workload version "${file.version}". Expected "1".`
    );
  }

  if (!Number.isInteger(file.chain) || file.chain <= 0) {
    throw new WorkloadValidationError(
      `Invalid chain ID "${file.chain}". Must be a positive integer.`
    );
  }

  if (!Array.isArray(file.steps) || file.steps.length === 0) {
    throw new WorkloadValidationError(
      "Workload must contain at least one step."
    );
  }

  for (let i = 0; i < file.steps.length; i++) {
    const step = file.steps[i];

    // Validate contract address
    try {
      getAddress(step.contract);
    } catch {
      throw new WorkloadValidationError(
        `Step ${i + 1}: invalid contract address "${step.contract}".`
      );
    }

    // Validate function signature present
    if (!step.function || step.function.trim() === "") {
      throw new WorkloadValidationError(
        `Step ${i + 1}: "function" field is required.`
      );
    }

    // Validate repeat — inputs must already be resolved to a number
    if (typeof step.repeat !== "number") {
      throw new WorkloadValidationError(
        `Step ${i + 1}: unresolved "repeat" (${JSON.stringify(step.repeat)}). ` +
          `Interactive inputs must be applied before validation.`
      );
    }
    if (!Number.isInteger(step.repeat) || step.repeat < 1) {
      throw new WorkloadValidationError(
        `Step ${i + 1}: "repeat" must be a positive integer, got ${step.repeat}.`
      );
    }

    if (step.repeat > MAX_REPEAT) {
      throw new WorkloadValidationError(
        `Step ${i + 1}: "repeat" exceeds maximum of ${MAX_REPEAT} (got ${step.repeat}). ` +
          `Split into multiple workload files if needed.`
      );
    }

    if (step.repeat > LARGE_WORKLOAD_THRESHOLD) {
      warnings.push({
        stepIndex: i,
        message:
          `Step ${i + 1} requests ${step.repeat} transactions. ` +
          `Large workloads may take significant time and consume considerable gas.`,
      });
    }

    // Validate value is a valid integer string if provided
    if (step.value !== undefined) {
      try {
        const v = BigInt(step.value);
        if (v < 0n) throw new Error("negative");
      } catch {
        throw new WorkloadValidationError(
          `Step ${i + 1}: "value" must be a non-negative integer string in wei, got "${step.value}".`
        );
      }
    }
  }

  return { warnings };
}

// ---------------------------------------------------------------------------
// MAINNET_CHAIN_IDS
// ---------------------------------------------------------------------------

const MAINNET_CHAIN_IDS = new Set([
  1,     // Ethereum
  10,    // Optimism
  8453,  // Base
  42161, // Arbitrum One
  137,   // Polygon
  43114, // Avalanche
  56,    // BNB Chain
]);

export function isMainnet(chainId: number): boolean {
  return MAINNET_CHAIN_IDS.has(chainId);
}

// ---------------------------------------------------------------------------
// Plan workload
// ---------------------------------------------------------------------------

export interface WorkloadPlan {
  simulation: SimulationResult;
  validation: ValidationResult;
  /** True if any step has executable < requested. */
  hasConstraints: boolean;
  /** True if chain is a mainnet. */
  isMainnet: boolean;
}

/**
 * Validates the workload file, runs the simulation engine across all steps,
 * and returns a complete plan ready for display and user approval.
 */
export async function planWorkload(opts: {
  file: WorkloadFile;
  client: PublicClient;
  walletAddress: Address;
}): Promise<WorkloadPlan> {
  const { file, client, walletAddress } = opts;

  // 1. Validate — throws on hard errors, returns warnings
  const validation = validateWorkload(file);

  // 2. Simulate all steps
  const simulation = await simulateWorkload({
    client,
    walletAddress,
    steps: file.steps,
    chainId: file.chain,
  });

  const hasConstraints = simulation.steps.some(
    (s) => s.executable < s.requested
  );

  return {
    simulation,
    validation,
    hasConstraints,
    isMainnet: isMainnet(file.chain),
  };
}
