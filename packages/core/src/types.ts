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
  /** Positional arguments matching the function signature. All values as strings. */
  args?: string[];
  /** Native value to send with the call, in wei (as a string to avoid precision loss). */
  value?: string;
  /** Number of times to repeat this step. Must be >= 1. */
  repeat: number;
}

export interface WorkloadFile {
  /** Schema version. Currently "1". */
  version: "1";
  /** EIP-155 chain ID. */
  chain: number;
  /** Optional RPC URL. Falls back to FOOP_RPC_URL env var. */
  rpc?: string;
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
}
