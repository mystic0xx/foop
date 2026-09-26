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
import type { ExecutionResult, TxRecord, WorkloadStep } from "./types.js";

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

/**
 * Executes a workload sequentially: one transaction at a time, waiting for
 * each receipt before submitting the next.
 *
 * - Nonces are managed locally; reset on conflict.
 * - RPC errors are retried up to `maxRetries` times with backoff.
 * - A failed transaction is recorded but execution continues.
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
    const step = steps[stepIdx];
    const count = executableCounts[stepIdx] ?? 0;

    if (count === 0) continue;

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
        transactions.push(record);
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

      transactions.push(record);
      onSettle?.(record);
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
  };
}
