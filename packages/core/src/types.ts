import type { Abi, Address, Hash, Hex } from "viem";

// ---------------------------------------------------------------------------
// Workload file
// ---------------------------------------------------------------------------

export interface WorkloadStep {
  /** Contract address (checksummed or lowercase hex). */
  contract: Address;
  /** Human-readable function signature, e.g. "deposit()" or "transfer(address,uint256)". */
  function: string;
  /** Optional ABI for this step. If omitted, resolved via Blockscout or signature. */
  abi?: Abi;
  /**
   * Positional arguments matching the function signature. Values are strings for
   * scalars; a tuple/struct parameter is a nested array of strings. May contain
   * `{amount}` / `{count}` placeholders resolved by `applyWorkloadInputs`.
   */
  args?: unknown[];
  /** Native value to send with the call, in wei (string). May be a `{amount}` placeholder. */
  value?: string;
  /** Number of times to repeat this step (>= 1), or a `{count}` placeholder string. */
  repeat: number | string;
}

/**
 * Declares interactive inputs prompted at run time by the CLI. When present, the
 * CLI asks for an amount and a count, then substitutes them into step
 * `args` / `value` / `repeat` via the `{amount}` / `{count}` placeholders.
 */
export interface WorkloadInput {
  /** Token whose decimals convert the human amount → wei. Omit to treat the amount as raw wei. */
  amountToken?: Address;
  /** Prompt label for the amount. Default: "Amount per transaction". */
  amountPrompt?: string;
  /** Prompt label for the count. Default: "Number of times to repeat". */
  countPrompt?: string;
}

/** Ensures an ERC-20 allowance exists before the steps execute. */
export interface WorkloadApprove {
  /** ERC-20 token to approve (typically the swap's tokenIn). */
  token: Address;
  /** Spender. Defaults to the first step's `contract`. */
  spender?: Address;
  /** "total" (amountWei × count), "max" (uint256 max), or an explicit wei string. Default "total". */
  amount?: "total" | "max" | (string & {});
}

export interface WorkloadFile {
  /** Schema version. Currently "1". */
  version: "1";
  /** EIP-155 chain ID. */
  chain: number;
  /** Optional RPC URL. Falls back to FOOP_RPC_URL env var. */
  rpc?: string;
  /** Optional interactive inputs prompted at run time. */
  input?: WorkloadInput;
  /** Optional ERC-20 approval ensured before executing steps. */
  approve?: WorkloadApprove;
  /** Ordered list of steps to execute. */
  steps: WorkloadStep[];
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

export type BlockedByReason =
  | "eth_balance"
  | "token_balance"
  | "allowance"
  | "revert"
  | "none";

export interface StepSimulation {
  /** Step index (0-based). */
  stepIndex: number;
  /** Number of iterations requested. */
  requested: number;
  /** Gas estimate per transaction (with safety buffer applied). */
  gasPerTx: bigint;
  /** Native value per transaction in wei. */
  valuePerTx: bigint;
  /** Estimated fee per transaction in wei (gasPerTx × effective gas price). */
  feePerTx: bigint;
  /** Maximum iterations limited by gas + fee budget. */
  maxByGas: number;
  /** Maximum iterations limited by native value. Null if step sends no value. */
  maxByValue: number | null;
  /** Maximum iterations limited by ERC-20 token balance. Null if not applicable. */
  maxByToken: number | null;
  /** Final executable count: min(requested, maxByGas, maxByValue, maxByToken). */
  executable: number;
  /** Primary reason the workload is blocked, or "none" if fully executable. */
  blockedBy: BlockedByReason;
  /** Whether this step is state-dependent (estimate may drift across iterations). */
  stateDependentWarning: boolean;
  /** Decoded revert reason from eth_call, if detected. */
  revertReason?: string;
}

export interface SimulationResult {
  /** Wallet address used for simulation. */
  walletAddress: Address;
  /** Chain ID. */
  chainId: number;
  /** Per-step simulation results. */
  steps: StepSimulation[];
  /** True if all steps are fully executable as requested. */
  fullyExecutable: boolean;
  /** Native token balance of the wallet at simulation time, in wei. */
  nativeBalance: bigint;
  /** Current base fee in wei. */
  baseFee: bigint;
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

export type TxStatus = "confirmed" | "failed" | "pending";

export interface TxRecord {
  /** Step index (0-based). */
  stepIndex: number;
  /** Iteration index within the step (0-based). */
  iteration: number;
  /** Transaction hash. */
  hash: Hash;
  /** Final status. */
  status: TxStatus;
  /** Gas used (available after confirmation). */
  gasUsed?: bigint;
  /** Block number of inclusion. */
  blockNumber?: bigint;
  /** Failure reason, if status is "failed". */
  failureReason?: string;
}

export interface ExecutionResult {
  /** Total transactions submitted. */
  submitted: number;
  /** Confirmed transaction count. */
  confirmed: number;
  /** Failed transaction count. */
  failed: number;
  /** Still-pending transaction count (should be 0 on clean run). */
  pending: number;
  /** Total gas used across all confirmed transactions. */
  totalGasUsed: bigint;
  /** Individual transaction records. */
  transactions: TxRecord[];
  /**
   * Iterations that were not run (staged execution only): the funds-capped
   * remainder of a partial step plus every iteration of steps skipped after a
   * halt. Undefined for the up-front executor.
   */
  skipped?: number;
  /** Why staged execution halted before finishing, if it did. */
  haltReason?: string;
}
