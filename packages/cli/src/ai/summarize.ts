import type { SimulationResult, WorkloadFile } from "@foop/core";
import { formatEther } from "viem";
import type Anthropic from "@anthropic-ai/sdk";
import { createAiClient } from "./client.js";

/**
 * Produces a short plain-English explanation of what the user is about to sign,
 * grounded in the concrete workload and the simulation result. Best-effort: if
 * the model call fails, the caller falls back to the structured render alone.
 */
export async function explainSimulation(opts: {
  file: WorkloadFile;
  simulation: SimulationResult;
  model: string;
}): Promise<string> {
  const { file, simulation, model } = opts;

  const facts = {
    chain: file.chain,
    wallet: simulation.walletAddress,
    nativeBalanceEth: formatEther(simulation.nativeBalance),
    fullyExecutable: simulation.fullyExecutable,
    steps: file.steps.map((s, i) => {
      const sim = simulation.steps[i];
      return {
        function: s.function,
        contract: s.contract,
        args: s.args ?? [],
        valueWei: s.value ?? "0",
        requested: sim?.requested,
        executable: sim?.executable,
        blockedBy: sim?.blockedBy,
        feePerTxWei: sim?.feePerTx?.toString(),
        revertReason: sim?.revertReason,
      };
    }),
  };

  const client = createAiClient();
  const response = await client.messages.create({
    model,
    max_tokens: 700,
    system:
      "You explain a blockchain transaction workload to a developer in plain English " +
      "so they understand exactly what they are about to sign before approving. Be " +
      "concrete and brief: 3–6 short sentences or bullet points. State what each step " +
      "does, how many transactions will actually run vs. were requested, the native " +
      "value being sent, the estimated total fee, and — clearly — anything blocked " +
      "(insufficient balance, allowance, expected revert). Do not add a preamble, do " +
      "not restate the raw JSON, and never invent numbers not present in the data.",
    messages: [
      {
        role: "user",
        content:
          "Explain this simulated workload in plain English:\n\n" +
          JSON.stringify(facts, null, 2),
      },
    ],
  });

  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}
