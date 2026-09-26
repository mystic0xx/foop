import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { WorkloadFile } from "@foop/core";
import { foopHome, assertValidName, assertWorkloadShape } from "./store.js";

// ---------------------------------------------------------------------------
// Bundled templates — defined inline so they survive bundling (no file copy).
// Addresses shown as 0xYOUR_… are meant to be edited after `foop new`.
// ---------------------------------------------------------------------------

const WETH_BASE_SEPOLIA = "0x4200000000000000000000000000000000000006";

const BUNDLED: Record<string, WorkloadFile> = {
  "wrap-eth": {
    version: "1",
    chain: 84532,
    input: { amountPrompt: "ETH to wrap per tx", countPrompt: "Number of wraps" },
    steps: [
      {
        contract: WETH_BASE_SEPOLIA,
        function: "deposit()",
        value: "{amount}",
        repeat: "{count}",
      },
    ],
  },
  "unwrap-eth": {
    version: "1",
    chain: 84532,
    input: { amountToken: WETH_BASE_SEPOLIA, amountPrompt: "WETH to unwrap per tx", countPrompt: "Number of unwraps" },
    steps: [
      {
        contract: WETH_BASE_SEPOLIA,
        function: "withdraw(uint256)",
        args: ["{amount}"],
        repeat: "{count}",
      },
    ],
  },
  "erc20-approve": {
    version: "1",
    chain: 84532,
    input: { amountToken: "0xYOUR_TOKEN_ADDRESS", amountPrompt: "Amount to approve", countPrompt: "Times to repeat" },
    steps: [
      {
        contract: "0xYOUR_TOKEN_ADDRESS",
        function: "approve(address,uint256)",
        args: ["0xYOUR_SPENDER_ADDRESS", "{amount}"],
        repeat: "{count}",
      },
    ],
  },
  "erc20-transfer": {
    version: "1",
    chain: 84532,
    input: { amountToken: "0xYOUR_TOKEN_ADDRESS", amountPrompt: "Amount per transfer", countPrompt: "Number of transfers" },
    steps: [
      {
        contract: "0xYOUR_TOKEN_ADDRESS",
        function: "transfer(address,uint256)",
        args: ["{recipient}", "{amount}"],
        repeat: "{count}",
      },
    ],
  },
  "uniswap-swap": {
    version: "1",
    chain: 84532,
    input: {
      amountToken: "0xYOUR_TOKEN_IN",
      amountPrompt: "Amount per swap",
      countPrompt: "Number of swaps",
    },
    approve: { token: "0xYOUR_TOKEN_IN", spender: "0xYOUR_ROUTER", amount: "total" },
    steps: [
      {
        contract: "0xYOUR_ROUTER",
        function:
          "exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))",
        args: [
          [
            "0xYOUR_TOKEN_IN",
            "0xYOUR_TOKEN_OUT",
            "10000",
            "{recipient}",
            "4102444800",
            "{amount}",
            "0",
            "0",
          ],
        ],
        repeat: "{count}",
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// Template store (user templates live under ~/.foop/templates)
// ---------------------------------------------------------------------------

function userTemplatesDir(): string {
  return join(foopHome(), "templates");
}

export interface TemplateInfo {
  name: string;
  source: "bundled" | "user";
  chain: number;
  steps: number;
}

export function listTemplates(): TemplateInfo[] {
  const user = new Map<string, WorkloadFile>();
  const dir = userTemplatesDir();
  if (existsSync(dir)) {
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
      try {
        user.set(
          f.replace(/\.json$/, ""),
          JSON.parse(readFileSync(join(dir, f), "utf-8")) as WorkloadFile
        );
      } catch {
        // skip malformed
      }
    }
  }

  const infos: TemplateInfo[] = [];
  for (const [name, file] of Object.entries(BUNDLED)) {
    if (user.has(name)) continue; // user shadows same-named bundled
    infos.push({ name, source: "bundled", chain: file.chain, steps: file.steps.length });
  }
  for (const [name, file] of user) {
    infos.push({ name, source: "user", chain: file.chain, steps: file.steps.length });
  }
  return infos.sort((a, b) => a.name.localeCompare(b.name));
}

/** User template shadows a same-named bundled one. */
export function loadTemplate(name: string): WorkloadFile | null {
  const userPath = join(userTemplatesDir(), `${name}.json`);
  if (existsSync(userPath)) {
    return JSON.parse(readFileSync(userPath, "utf-8")) as WorkloadFile;
  }
  return BUNDLED[name] ?? null;
}

export function saveTemplate(name: string, file: WorkloadFile): string {
  assertValidName(name);
  assertWorkloadShape(file);
  mkdirSync(userTemplatesDir(), { recursive: true });
  const path = join(userTemplatesDir(), `${name}.json`);
  writeFileSync(path, JSON.stringify(file, null, 2) + "\n", "utf-8");
  return path;
}
