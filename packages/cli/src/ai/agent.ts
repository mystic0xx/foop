import Anthropic from "@anthropic-ai/sdk";
import * as p from "@clack/prompts";
import { resolveAbi } from "@foop/core";
import type { WorkloadFile } from "@foop/core";
import { createAiClient, CHAINS } from "./client.js";
import { assertWorkloadShape } from "../store.js";

// ---------------------------------------------------------------------------
// Tool: extract writable functions from a resolved ABI (mirrors init).
// ---------------------------------------------------------------------------

async function listContractFunctions(
  chainId: number,
  address: string
): Promise<{ source: string; functions: string[]; verified: boolean }> {
  const resolved = await resolveAbi({
    chainId,
    address,
    functionSignature: "fallback()",
  });
  const verified = ["blockscout", "etherscan", "sourcify"].includes(
    resolved.source
  );
  if (!verified) {
    return { source: resolved.source, functions: [], verified: false };
  }
  const functions = (resolved.abi as ReadonlyArray<Record<string, unknown>>)
    .filter(
      (e) =>
        e.type === "function" &&
        typeof e.stateMutability === "string" &&
        e.stateMutability !== "view" &&
        e.stateMutability !== "pure"
    )
    .map((fn) => {
      const inputs = (fn.inputs as { type: string }[] | undefined) ?? [];
      return `${fn.name as string}(${inputs.map((i) => i.type).join(",")})`;
    });
  return { source: resolved.source, functions, verified: true };
}

// ---------------------------------------------------------------------------
// Tool definitions handed to the model
// ---------------------------------------------------------------------------

const TOOLS: Anthropic.Tool[] = [
  {
    name: "list_contract_functions",
    description:
      "Resolve a contract's ABI and list its writable (non-view) functions. " +
      "Call this once you know the chain and contract address so you can pick " +
      "the right function instead of guessing its signature.",
    input_schema: {
      type: "object",
      properties: {
        chainId: { type: "integer", description: "EIP-155 chain id" },
        address: { type: "string", description: "Contract address (0x…)" },
      },
      required: ["chainId", "address"],
    },
  },
  {
    name: "ask_user",
    description:
      "Ask the user for information you cannot infer (contract address, token " +
      "amounts, recipient, which function, count, etc.). Batch all outstanding " +
      "questions into one call. Never guess addresses or amounts — ask.",
    input_schema: {
      type: "object",
      properties: {
        questions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              prompt: { type: "string" },
              placeholder: { type: "string" },
            },
            required: ["id", "prompt"],
          },
        },
      },
      required: ["questions"],
    },
  },
  {
    name: "finalize_workload",
    description:
      "Emit the finished foop workload once every field is known and concrete " +
      "(no placeholders). Include a one-sentence plain-English summary.",
    input_schema: {
      type: "object",
      properties: {
        summary: { type: "string" },
        workload: {
          type: "object",
          properties: {
            version: { type: "string", enum: ["1"] },
            chain: { type: "integer" },
            rpc: { type: "string" },
            steps: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  contract: { type: "string" },
                  function: { type: "string" },
                  args: { type: "array" },
                  value: { type: "string" },
                  repeat: { type: "integer" },
                },
                required: ["contract", "function", "repeat"],
              },
            },
          },
          required: ["version", "chain", "steps"],
        },
      },
      required: ["workload", "summary"],
    },
  },
];

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const CHAIN_LINES = CHAINS.map(
  (c) => `  - ${c.name} → ${c.id}${c.testnet ? " (testnet)" : " (MAINNET)"}`
).join("\n");

const SYSTEM_PROMPT = `You are foop's workload builder. foop lets developers define, simulate,
and execute repeatable on-chain workloads (e.g. "deposit() × 100"). Your job is to turn a
natural-language request into a concrete foop workload JSON.

A workload has this shape:
{
  "version": "1",
  "chain": <chain id number>,
  "rpc": "<optional rpc url>",
  "steps": [
    {
      "contract": "0x…",              // target contract address
      "function": "deposit(uint256)", // human-readable signature
      "args": ["1000000000000000000"],// positional args as strings; omit if none
      "value": "10000000000000000",   // native value in WEI (string); omit if 0
      "repeat": 100                    // integer >= 1
    }
  ]
}

Supported chains (map names to ids):
${CHAIN_LINES}

Rules:
- NEVER invent a contract address, recipient, or token amount. If the user references
  "this contract"/"this CA"/a token without giving the address, call ask_user.
- Once you know the chain + contract address and the user's intent (swap, deposit, mint,
  transfer, …), call list_contract_functions and pick the matching function. If several
  match or the contract isn't verified, ask_user (offer the candidates).
- Resolve every argument. If you can't derive an arg from the request, ask_user for it.
  Explain what each value is (units, address role).
- "value" is the NATIVE token amount in wei as a string. Convert ETH → wei (multiply by
  1e18): "0.01 ETH" → "10000000000000000". Token amounts inside args are in the token's
  base units — if you don't know the decimals, ask_user for the raw/base-unit value.
- "repeat" is the count. "10 times" → 10. Must be an integer >= 1.
- Distinct actions become separate steps (e.g. approve then swap).
- Batch questions: put every open question into a single ask_user call when possible.
- When (and only when) every field is concrete, call finalize_workload with the workload
  and a one-sentence plain-English summary of what it will do.
- If the user targets a MAINNET chain, still build it, but keep amounts conservative and
  make the summary explicit that it spends real funds.`;

// ---------------------------------------------------------------------------
// Interactive prompt for the ask_user tool
// ---------------------------------------------------------------------------

interface AskQuestion {
  id: string;
  prompt: string;
  placeholder?: string;
}

async function runAskUser(
  questions: AskQuestion[]
): Promise<Record<string, string>> {
  const answers: Record<string, string> = {};
  for (const q of questions) {
    const value = await p.text({
      message: q.prompt,
      placeholder: q.placeholder,
    });
    if (p.isCancel(value)) {
      throw new AiCancelled();
    }
    answers[q.id] = String(value ?? "").trim();
  }
  return answers;
}

export class AiCancelled extends Error {
  constructor() {
    super("Cancelled.");
    this.name = "AiCancelled";
  }
}

// ---------------------------------------------------------------------------
// Public: run the agent loop until a workload is finalized.
// ---------------------------------------------------------------------------

export interface GeneratedWorkload {
  file: WorkloadFile;
  summary: string;
}

const MAX_TURNS = 16;

export async function generateWorkload(opts: {
  prompt: string;
  model: string;
}): Promise<GeneratedWorkload> {
  const client = createAiClient();
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: opts.prompt },
  ];

  const spinner = p.spinner();

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    spinner.start("Thinking…");
    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model: opts.model,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages,
      });
    } finally {
      spinner.stop("");
    }

    // Preserve the full assistant turn (including any thinking blocks).
    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason !== "tool_use") {
      // Model replied with prose instead of a tool call — surface it and nudge.
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      if (text) p.log.info(text);
      messages.push({
        role: "user",
        content:
          "Continue. Use ask_user for anything you need, or finalize_workload when ready.",
      });
      continue;
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;

      if (block.name === "finalize_workload") {
        const input = block.input as {
          workload: unknown;
          summary?: string;
        };
        try {
          assertWorkloadShape(input.workload);
          return {
            file: input.workload as WorkloadFile,
            summary: input.summary ?? "",
          };
        } catch (err: unknown) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            is_error: true,
            content: `Invalid workload: ${
              err instanceof Error ? err.message : String(err)
            }. Fix it and call finalize_workload again.`,
          });
        }
      } else if (block.name === "ask_user") {
        const { questions } = block.input as { questions: AskQuestion[] };
        const answers = await runAskUser(questions ?? []);
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(answers),
        });
      } else if (block.name === "list_contract_functions") {
        const { chainId, address } = block.input as {
          chainId: number;
          address: string;
        };
        try {
          const result = await listContractFunctions(chainId, address);
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: result.verified
              ? `Verified via ${result.source}. Writable functions:\n${result.functions
                  .map((f) => `  - ${f}`)
                  .join("\n")}`
              : `Contract not verified on Blockscout/Etherscan/Sourcify. Ask the user for the exact function signature (e.g. "deposit(uint256)").`,
          });
        } catch (err: unknown) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            is_error: true,
            content: `ABI lookup failed: ${
              err instanceof Error ? err.message : String(err)
            }. Ask the user for the function signature.`,
          });
        }
      }
    }

    messages.push({ role: "user", content: toolResults });
  }

  throw new Error(
    "AI could not finish building the workload (too many steps). Try rephrasing your request."
  );
}
