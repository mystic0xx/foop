import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import * as p from "@clack/prompts";
import { resolveAbi } from "@foop/core";
import type { WorkloadFile, WorkloadStep } from "@foop/core";
import {
  printError,
  printDivider,
} from "../renderer/progress.js";

// ---------------------------------------------------------------------------
// Chain list for selection
// ---------------------------------------------------------------------------

const CHAINS = [
  { value: "84532", label: "Base Sepolia (84532)" },
  { value: "8453",  label: "Base (8453)" },
  { value: "1",     label: "Ethereum Mainnet (1)" },
  { value: "10",    label: "Optimism (10)" },
  { value: "42161", label: "Arbitrum One (42161)" },
  { value: "137",   label: "Polygon (137)" },
  { value: "11155111", label: "Sepolia (11155111)" },
  { value: "31337", label: "Anvil / Hardhat (31337)" },
];

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export async function runInit(_args: string[]): Promise<void> {
  console.log("");
  p.intro("  foop init — scaffold a workload file");

  // 1. Chain
  const chainRaw = await p.select({
    message: "Select network",
    options: CHAINS,
  });
  if (p.isCancel(chainRaw)) { cancelled(); return; }
  const chainId = Number(chainRaw);

  // 2. RPC URL (optional)
  const rpcRaw = await p.text({
    message: "RPC URL (optional — leave blank to use FOOP_RPC_URL env var)",
    placeholder: "https://sepolia.base.org",
    validate: (v) => {
      if (v && !v.startsWith("http")) return "Must start with http:// or https://";
    },
  });
  if (p.isCancel(rpcRaw)) { cancelled(); return; }
  const rpc = rpcRaw || undefined;

  // 3. Contract address
  const contractRaw = await p.text({
    message: "Contract address",
    placeholder: "0x...",
    validate: (v) => {
      if (!/^0x[0-9a-fA-F]{40}$/.test(v)) return "Must be a valid hex address (0x + 40 chars)";
    },
  });
  if (p.isCancel(contractRaw)) { cancelled(); return; }
  const contract = contractRaw as `0x${string}`;

  // 4. Try to fetch ABI
  const spinner = p.spinner();
  spinner.start("Fetching ABI from Blockscout…");

  let functionOptions: Array<{ value: string; label: string }> = [];
  let resolvedAbi;

  try {
    resolvedAbi = await resolveAbi({
      chainId,
      address: contract,
      functionSignature: "fallback()",
    });

    if (resolvedAbi.source === "blockscout") {
      // Extract write functions from verified ABI
      const writeFns = (resolvedAbi.abi as ReadonlyArray<Record<string, unknown>>)
        .filter(
          (e) =>
            e.type === "function" &&
            typeof e.stateMutability === "string" &&
            e.stateMutability !== "view" &&
            e.stateMutability !== "pure"
        )
        .map((fn) => {
          const inputs = (fn.inputs as { type: string }[] | undefined) ?? [];
          const sig = `${fn.name as string}(${inputs.map((i) => i.type).join(",")})`;
          return { value: sig, label: sig };
        });

      if (writeFns.length > 0) {
        functionOptions = writeFns;
        spinner.stop(`ABI fetched — ${writeFns.length} writable function(s) found`);
      } else {
        spinner.stop("ABI fetched but no writable functions found — enter manually");
      }
    } else {
      spinner.stop("Contract not verified on Blockscout — enter function manually");
    }
  } catch {
    spinner.stop("Could not fetch ABI — enter function manually");
  }

  // 5. Function selection or manual entry
  let functionSig: string;

  if (functionOptions.length > 0) {
    const fnRaw = await p.select({
      message: "Select function",
      options: [
        ...functionOptions,
        { value: "__manual__", label: "Enter manually…" },
      ],
    });
    if (p.isCancel(fnRaw)) { cancelled(); return; }

    if (fnRaw === "__manual__") {
      const manualRaw = await p.text({
        message: "Function signature",
        placeholder: "deposit()",
        validate: (v) => {
          if (!v.includes("(")) return "Must include parentheses, e.g. deposit()";
        },
      });
      if (p.isCancel(manualRaw)) { cancelled(); return; }
      functionSig = manualRaw;
    } else {
      functionSig = fnRaw as string;
    }
  } else {
    const manualRaw = await p.text({
      message: "Function signature",
      placeholder: "deposit()",
      validate: (v) => {
        if (!v.includes("(")) return "Must include parentheses, e.g. deposit()";
      },
    });
    if (p.isCancel(manualRaw)) { cancelled(); return; }
    functionSig = manualRaw;
  }

  // 6. Arguments (optional, comma-separated)
  const argsRaw = await p.text({
    message: "Arguments (comma-separated, leave blank if none)",
    placeholder: "0xRecipient, 1000000000000000000",
  });
  if (p.isCancel(argsRaw)) { cancelled(); return; }
  const args =
    argsRaw && argsRaw.trim()
      ? argsRaw.split(",").map((a) => a.trim())
      : undefined;

  // 7. Value in ETH (optional)
  const valueRaw = await p.text({
    message: "ETH value per transaction (leave blank for 0)",
    placeholder: "0.01",
    validate: (v) => {
      if (v && isNaN(Number(v))) return "Must be a number, e.g. 0.01";
      if (v && Number(v) < 0) return "Must be non-negative";
    },
  });
  if (p.isCancel(valueRaw)) { cancelled(); return; }
  const valueEth = valueRaw ? Number(valueRaw) : 0;
  const valueWei = valueEth > 0
    ? String(BigInt(Math.round(valueEth * 1e18)))
    : undefined;

  // 8. Repeat count
  const repeatRaw = await p.text({
    message: "Number of times to repeat",
    placeholder: "100",
    validate: (v) => {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1) return "Must be a positive integer";
      if (n > 10_000) return "Maximum is 10,000";
    },
  });
  if (p.isCancel(repeatRaw)) { cancelled(); return; }
  const repeat = Number(repeatRaw);

  // 9. Output file path
  const outRaw = await p.text({
    message: "Output file path",
    placeholder: "workload.json",
    initialValue: "workload.json",
  });
  if (p.isCancel(outRaw)) { cancelled(); return; }
  const outPath = outRaw || "workload.json";

  // 10. Build + write workload file
  const step: WorkloadStep = {
    contract,
    function: functionSig,
    ...(args ? { args } : {}),
    ...(valueWei ? { value: valueWei } : {}),
    repeat,
  };

  const workload: WorkloadFile = {
    version: "1",
    chain: chainId,
    ...(rpc ? { rpc } : {}),
    steps: [step],
  };

  const absPath = resolve(process.cwd(), outPath);
  try {
    writeFileSync(absPath, JSON.stringify(workload, null, 2) + "\n", "utf-8");
  } catch (err: unknown) {
    printError(`Could not write file: ${absPath}\n  ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  p.outro(`  Wrote ${outPath}`);
  printDivider();
  console.log(`  Next steps:`);
  console.log(`    foop simulate ${outPath}`);
  console.log(`    foop run ${outPath}`);
  printDivider();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cancelled(): void {
  console.log("\n  Cancelled.\n");
  process.exit(0);
}
