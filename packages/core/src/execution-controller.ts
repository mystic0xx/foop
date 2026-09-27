import {
  type Account,
  type Address,
  type Chain,
  type PublicClient,
  type WalletClient,
  encodeFunctionData,
} from "viem";
import { resolveAbi } from "./abi-resolver.js";
import { NonceManager } from "./nonce-manager.js";
import { simulateStep } from "./simulation-engine.js";
import type {
  BlockedByReason,
  ExecutionResult,
  TxRecord,
  WorkloadStep,
} from "./types.js";

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface ExecuteWorkloadOptions {
  client: PublicClient;
  wallet: WalletClient;
  /** Full local account object (not just address) so viem signs locally. */
  account: Account;
  steps: WorkloadStep[];
  /** Per-step executable counts from simulation. Must match steps length. */
  executableCounts: number[];
  chainId: number;
  /** Called after each transaction is submitted (hash known, not yet confirmed). */
  onSubmit?: (record: Pick<TxRecord, "stepIndex" | "iteration" | "hash">) => void;
  /** Called after each transaction is confirmed or failed. */
  onSettle?: (record: TxRecord) => void;
  /** Max RPC retry attempts on network error. Default 3. */
  maxRetries?: number;
}

// ---------------------------------------------------------------------------
// Execution controller
// ---------------------------------------------------------------------------

const RETRY_DELAY_MS = 1_500;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Per-step iteration runner (shared by executeWorkload + executeWorkloadStaged)
// ---------------------------------------------------------------------------

interface RunStepIterationsParams {
  client: PublicClient;
  wallet: WalletClient;
  account: Account;
  step: WorkloadStep;
  stepIdx: number;
  count: number;
  chainId: number;
  nonceManager: NonceManager;
  maxRetries: number;
  onSubmit?: (record: Pick<TxRecord, "stepIndex" | "iteration" | "hash">) => void;
  onSettle?: (record: TxRecord) => void;
}

interface StepRunResult {
  records: TxRecord[];
  confirmed: number;
  failed: number;
  submitted: number;
}

/**
 * Runs `count` iterations of a single step: encode → submit (with nonce/retry)
 * → wait for receipt → record. Shared by the up-front and staged executors.
 */
async function runStepIterations(
  params: RunStepIterationsParams
): Promise<StepRunResult> {
  const {
    client,
    wallet,
    account,
    step,
    stepIdx,
    count,
    chainId,
    nonceManager,
    maxRetries,
    onSubmit,
    onSettle,
  } = params;

  const records: TxRecord[] = [];
  let confirmed = 0;
  let failed = 0;
  let submitted = 0;

  const { abi } = await resolveAbi({
    chainId,
    address: step.contract,
    functionSignature: step.function,
    providedAbi: step.abi,
  });

  const functionName = step.function.split("(")[0].trim();

  for (let iter = 0; iter < count; iter++) {
    const data = encodeFunctionData({
      abi,
      functionName,
      args: step.args ?? [],
    });

    const valueWei = step.value ? BigInt(step.value) : undefined;
    const nonce = nonceManager.next();

    let hash: `0x${string}` | undefined;
    let lastErr: unknown;

    // Submit with retry
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        hash = await wallet.sendTransaction({
          account,
          to: step.contract as Address,
          data,
          value: valueWei,
          nonce,
          chain: {
            id: chainId,
            name: `chain-${chainId}`,
            nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
            rpcUrls: { default: { http: [] } },
          } as Chain,
        });
        break;
      } catch (err: unknown) {
        lastErr = err;
        const msg = err instanceof Error ? err.message : String(err);
        // Nonce conflict — reset and retry with fresh nonce
        if (msg.includes("nonce") || msg.includes("replacement")) {
          await nonceManager.reset();
        } else if (attempt < maxRetries - 1) {
          await sleep(RETRY_DELAY_MS * (attempt + 1));
        }
      }
    }

    if (!hash) {
      const reason =
        lastErr instanceof Error ? lastErr.message : String(lastErr);
      const record: TxRecord = {
        stepIndex: stepIdx,
        iteration: iter,
        hash: "0x0000000000000000000000000000000000000000000000000000000000000000",
        status: "failed",
        failureReason: reason,
      };
      records.push(record);
      failed++;
      onSettle?.(record);
      continue;
    }

    submitted++;
    onSubmit?.({ stepIndex: stepIdx, iteration: iter, hash });

    // Wait for receipt
    let record: TxRecord;
    try {
      const receipt = await client.waitForTransactionReceipt({ hash });
      const status = receipt.status === "success" ? "confirmed" : "failed";
      record = {
        stepIndex: stepIdx,
        iteration: iter,
        hash,
        status,
        gasUsed: receipt.gasUsed,
        blockNumber: receipt.blockNumber,
      };
      if (status === "confirmed") confirmed++;
      else failed++;
    } catch (err: unknown) {
      record = {
        stepIndex: stepIdx,
        iteration: iter,
        hash,
        status: "failed",
        failureReason: err instanceof Error ? err.message : String(err),
      };
      failed++;
    }

    records.push(record);
    onSettle?.(record);
  }

  return { records, confirmed, failed, submitted };
}

// ---------------------------------------------------------------------------
// Up-front executor: runs pre-computed per-step counts straight through.
// ---------------------------------------------------------------------------

/**
 * Executes a workload sequentially: one transaction at a time, waiting for
 * each receipt before submitting the next.
 *
 * - Nonces are managed locally; reset on conflict.
 * - RPC errors are retried up to `maxRetries` times with backoff.
 * - A failed transaction is recorded but execution continues.
 * - A step whose executable count is 0 is skipped (no re-simulation).
 */
export async function executeWorkload(
  opts: ExecuteWorkloadOptions
): Promise<ExecutionResult> {
  const {
    client,
    wallet,
    account,
    steps,
    executableCounts,
    chainId,
    onSubmit,
    onSettle,
    maxRetries = 3,
  } = opts;

  const walletAddress = account.address;
  const nonceManager = new NonceManager(client, walletAddress);
  await nonceManager.init();

  const transactions: TxRecord[] = [];
  let confirmed = 0;
  let failed = 0;
  let submitted = 0;

  for (let stepIdx = 0; stepIdx < steps.length; stepIdx++) {
    const count = executableCounts[stepIdx] ?? 0;
    if (count === 0) continue;

    const r = await runStepIterations({
      client,
      wallet,
      account,
      step: steps[stepIdx],
      stepIdx,
      count,
      chainId,
      nonceManager,
      maxRetries,
      onSubmit,
      onSettle,
    });
    transactions.push(...r.records);
    confirmed += r.confirmed;
    failed += r.failed;
    submitted += r.submitted;
  }

  const totalGasUsed = transactions.reduce(
    (sum, tx) => sum + (tx.gasUsed ?? 0n),
    0n
  );

  return { submitted, confirmed, failed, pending: 0, totalGasUsed, transactions };
}

// ---------------------------------------------------------------------------
// Staged executor: re-simulates each step against live state right before
// running it, so dependent steps (approve → supply → borrow) execute in one
// pass. A step that is fully blocked halts the remaining (dependent) steps.
// ---------------------------------------------------------------------------

export interface StagedStepInfo {
  stepIndex: number;
  /** Iterations requested for the step. */
  requested: number;
  /** Iterations that will actually run (0 when the step is blocked). */
  executable: number;
  blockedBy: BlockedByReason;
  revertReason?: string;
  /** True when this step is blocked and the remaining steps are being skipped. */
  halted: boolean;
}

export interface ExecuteWorkloadStagedOptions {
  client: PublicClient;
  wallet: WalletClient;
  account: Account;
  steps: WorkloadStep[];
  chainId: number;
  /** Called once per step before its iterations run (or when it halts). */
  onStep?: (info: StagedStepInfo) => void;
  onSubmit?: (record: Pick<TxRecord, "stepIndex" | "iteration" | "hash">) => void;
  onSettle?: (record: TxRecord) => void;
  maxRetries?: number;
}

/**
 * Executes a multi-step workload with live re-simulation between steps. Before
 * each step it re-fetches balance/fees and re-runs `simulateStep` against the
 * current chain state — so a step that depends on an earlier one (e.g. borrow
 * after supply) is only checked once its preconditions actually exist.
 *
 * Halt semantics: if a step is fully blocked (0 executable), or any of its
 * transactions fail on-chain, the remaining steps are skipped (they are assumed
 * to depend on it). A funds-capped step runs what it can afford and continues.
 */
export async function executeWorkloadStaged(
  opts: ExecuteWorkloadStagedOptions
): Promise<ExecutionResult> {
  const {
    client,
    wallet,
    account,
    steps,
    chainId,
    onStep,
    onSubmit,
    onSettle,
    maxRetries = 3,
  } = opts;

  const walletAddress = account.address;
  const nonceManager = new NonceManager(client, walletAddress);
  await nonceManager.init();

  const transactions: TxRecord[] = [];
  let confirmed = 0;
  let failed = 0;
  let submitted = 0;
  let skipped = 0;
  let halted = false;
  let haltReason: string | undefined;

  for (let stepIdx = 0; stepIdx < steps.length; stepIdx++) {
    const step = steps[stepIdx];
    const requested =
      typeof step.repeat === "number" ? step.repeat : Number(step.repeat);

    if (halted) {
      skipped += requested;
      continue;
    }

    // Re-simulate this step against CURRENT chain state (reflecting prior steps).
    const [balance, fees] = await Promise.all([
      client.getBalance({ address: walletAddress }),
      client.estimateFeesPerGas(),
    ]);
    const sim = await simulateStep({
      client,
      walletAddress,
      step,
      stepIndex: stepIdx,
      nativeBalance: balance,
      baseFee: fees.maxFeePerGas ?? 0n,
      priorityFee: fees.maxPriorityFeePerGas ?? 0n,
    });

    const willRun = Math.min(requested, sim.executable);

    if (willRun === 0) {
      onStep?.({
        stepIndex: stepIdx,
        requested,
        executable: 0,
        blockedBy: sim.blockedBy,
        revertReason: sim.revertReason,
        halted: true,
      });
      skipped += requested;
      halted = true;
      haltReason = sim.revertReason
        ? `Step ${stepIdx + 1} blocked: ${sim.revertReason}`
        : `Step ${stepIdx + 1} blocked (${sim.blockedBy})`;
      continue;
    }

    onStep?.({
      stepIndex: stepIdx,
      requested,
      executable: willRun,
      blockedBy: sim.blockedBy,
      revertReason: sim.revertReason,
      halted: false,
    });

    const r = await runStepIterations({
      client,
      wallet,
      account,
      step,
      stepIdx,
      count: willRun,
      chainId,
      nonceManager,
      maxRetries,
      onSubmit,
      onSettle,
    });
    transactions.push(...r.records);
    confirmed += r.confirmed;
    failed += r.failed;
    submitted += r.submitted;
    skipped += requested - willRun;

    // A step whose transactions failed on-chain breaks the dependency chain.
    if (r.failed > 0) {
      halted = true;
      haltReason = `Step ${stepIdx + 1} had ${r.failed} failed transaction(s); halting dependent steps`;
    }
  }

  const totalGasUsed = transactions.reduce(
    (sum, tx) => sum + (tx.gasUsed ?? 0n),
    0n
  );

  return {
    submitted,
    confirmed,
    failed,
    pending: 0,
    totalGasUsed,
    transactions,
    skipped,
    haltReason,
  };
}
