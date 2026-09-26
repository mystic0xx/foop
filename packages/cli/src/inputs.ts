import * as p from "@clack/prompts";
import { parseUnits, type PublicClient } from "viem";
import { readDecimals } from "@foop/core";
import type { WorkloadFile } from "@foop/core";

/** Resolved interactive inputs, plus the decimals used for the amount. */
export interface PromptedInputs {
  amountWei: bigint;
  count: number;
  /** Decimals used to convert the human amount → wei (18 when no token given). */
  decimals: number;
}

/**
 * Prompts for the per-transaction amount and repeat count declared by a
 * workload's `input` block (or implied by `{amount}`/`{count}` placeholders).
 * Converts the amount to wei using the `amountToken` decimals when present,
 * otherwise treats the amount as whole native units (18 decimals).
 *
 * Requires an interactive TTY; throws otherwise.
 */
export async function promptWorkloadInputs(
  file: WorkloadFile,
  client: PublicClient
): Promise<PromptedInputs> {
  if (!process.stdin.isTTY) {
    throw new Error(
      "This workload needs interactive input (amount / count). " +
        "Run foop in an interactive terminal."
    );
  }

  const input = file.input;
  const amountPrompt = input?.amountPrompt ?? "Amount per transaction";
  const countPrompt = input?.countPrompt ?? "Number of times to repeat";

  // Resolve decimals for the amount → wei conversion.
  let decimals = 18;
  if (input?.amountToken) {
    decimals = await readDecimals(client, input.amountToken);
  }

  const amountRaw = await p.text({
    message: amountPrompt,
    placeholder: "20",
    validate: (v) => {
      if (!v || !v.trim()) return "Required";
      if (isNaN(Number(v)) || Number(v) <= 0) return "Must be a positive number";
    },
  });
  if (p.isCancel(amountRaw)) {
    console.log("\n  Cancelled.\n");
    process.exit(0);
  }

  const countRaw = await p.text({
    message: countPrompt,
    placeholder: "10",
    validate: (v) => {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1) return "Must be a positive integer";
      if (n > 10_000) return "Maximum is 10,000";
    },
  });
  if (p.isCancel(countRaw)) {
    console.log("\n  Cancelled.\n");
    process.exit(0);
  }

  const amountWei = parseUnits(String(amountRaw), decimals);
  const count = Number(countRaw);
  return { amountWei, count, decimals };
}
