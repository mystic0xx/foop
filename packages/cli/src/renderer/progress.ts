import { formatUnits } from "viem";
import type { SimulationResult, StepSimulation } from "@foop/core";

// ---------------------------------------------------------------------------
// Colour helpers (chalk-free — uses ANSI escape codes directly for zero dep)
// ---------------------------------------------------------------------------

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
};

function bold(s: string): string { return `${c.bold}${s}${c.reset}`; }
function dim(s: string): string { return `${c.dim}${s}${c.reset}`; }
function green(s: string): string { return `${c.green}${s}${c.reset}`; }
function red(s: string): string { return `${c.red}${s}${c.reset}`; }
function yellow(s: string): string { return `${c.yellow}${s}${c.reset}`; }
function cyan(s: string): string { return `${c.cyan}${s}${c.reset}`; }

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/** Format wei as ETH with up to 6 decimal places, trimming trailing zeros. */
export function formatEth(wei: bigint): string {
  const eth = formatUnits(wei, 18);
  // Trim trailing zeros after decimal point
  return eth.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

/** Right-pad a string to width. */
function rpad(s: string, width: number): string {
  return s + " ".repeat(Math.max(0, width - s.length));
}

/** Left-pad a string to width. */
function lpad(s: string, width: number): string {
  return " ".repeat(Math.max(0, width - s.length)) + s;
}

// ---------------------------------------------------------------------------
// Section header
// ---------------------------------------------------------------------------

export function printHeader(title: string): void {
  console.log("");
  console.log(bold(`  ${title}`));
  console.log(`  ${"─".repeat(title.length + 2)}`);
  console.log("");
}

export function printDivider(): void {
  console.log("");
}

// ---------------------------------------------------------------------------
// Simulation result table
// ---------------------------------------------------------------------------

export function printSimulationResult(
  sim: SimulationResult,
  stepLabels: string[]
): void {
  printHeader("SIMULATION RESULT");

  for (let i = 0; i < sim.steps.length; i++) {
    const step = sim.steps[i];
    const label = stepLabels[i] ?? `Step ${i + 1}`;

    if (sim.steps.length > 1) {
      console.log(`  ${cyan(bold(`Step ${i + 1}`))} ${dim(label)}`);
    }

    printStepSimulation(step);

    if (i < sim.steps.length - 1) {
      console.log("");
    }
  }

  console.log("");
}

function printStepSimulation(step: StepSimulation): void {
  const col = 22;

  const rows: Array<[string, string]> = [
    ["Requested", String(step.requested)],
    ["Gas per tx", `~${formatEth(step.feePerTx)} ETH`],
  ];

  if (step.valuePerTx > 0n) {
    rows.push(["Value per tx", `${formatEth(step.valuePerTx)} ETH`]);
  }

  rows.push(["Max by gas", String(step.maxByGas)]);

  if (step.maxByValue !== null) {
    rows.push(["Max by ETH value", String(step.maxByValue)]);
  }

  if (step.maxByToken !== null) {
    rows.push(["Max by token", String(step.maxByToken)]);
  }

  rows.push(["", ""]); // spacer

  const executableStr = String(step.executable);
  const execColor =
    step.executable >= step.requested
      ? green
      : step.executable === 0
      ? red
      : yellow;

  rows.push(["Executable", execColor(bold(executableStr))]);

  if (step.blockedBy !== "none") {
    const reasons: Record<string, string> = {
      eth_balance: "Insufficient ETH",
      token_balance: "Insufficient token balance",
      allowance: "Insufficient allowance",
      revert: "Transaction reverts",
    };
    rows.push(["Blocked by", red(reasons[step.blockedBy] ?? step.blockedBy)]);
  }

  if (step.revertReason) {
    rows.push(["Revert reason", red(step.revertReason.slice(0, 60))]);
  }

  if (step.stateDependentWarning) {
    rows.push([
      "Warning",
      yellow("State-dependent — gas estimate may drift across iterations"),
    ]);
  }

  for (const [key, val] of rows) {
    if (key === "" && val === "") {
      console.log("");
      continue;
    }
    console.log(`  ${dim(rpad(key, col))} ${val}`);
  }
}

// ---------------------------------------------------------------------------
// Mainnet warning
// ---------------------------------------------------------------------------

export function printMainnetWarning(totalTxs: number): void {
  console.log("");
  console.log(red(bold("  ⚠  MAINNET DETECTED")));
  console.log("");
  console.log(
    `  You are about to execute ${bold(String(totalTxs))} transaction(s) on a mainnet.`
  );
  console.log("  This will spend real funds. There is no undo.");
  console.log("");
}

// ---------------------------------------------------------------------------
// Large workload warning
// ---------------------------------------------------------------------------

export function printLargeWorkloadWarning(total: number): void {
  console.log("");
  console.log(yellow(bold("  ⚠  Large workload")));
  console.log("");
  console.log(
    `  ${bold(String(total))} transactions requested. This may consume significant gas.`
  );
  console.log("");
}

// ---------------------------------------------------------------------------
// Progress bar
// ---------------------------------------------------------------------------

const BAR_WIDTH = 30;

export function renderProgressBar(done: number, total: number): string {
  const pct = total === 0 ? 1 : done / total;
  const filled = Math.round(BAR_WIDTH * pct);
  const empty = BAR_WIDTH - filled;
  return `[${"█".repeat(filled)}${dim("░".repeat(empty))}]`;
}

// ---------------------------------------------------------------------------
// Live progress line (overwrites current line)
// ---------------------------------------------------------------------------

export function printProgress(
  done: number,
  total: number,
  lastHash?: string
): void {
  const bar = renderProgressBar(done, total);
  const pct = total === 0 ? 100 : Math.round((done / total) * 100);
  const hashSuffix = lastHash ? dim(`  ${lastHash.slice(0, 12)}…`) : "";
  process.stdout.write(
    `\r  ${bar} ${lpad(String(pct), 3)}%  ${lpad(String(done), String(total).length)}/${total}${hashSuffix}  `
  );
}

export function clearProgressLine(): void {
  process.stdout.write("\r" + " ".repeat(80) + "\r");
}

// ---------------------------------------------------------------------------
// Execution summary
// ---------------------------------------------------------------------------

export function printExecutionSummary(opts: {
  confirmed: number;
  failed: number;
  pending: number;
  totalGasUsed: bigint;
  total: number;
}): void {
  const { confirmed, failed, pending, totalGasUsed, total } = opts;
  const avgGas =
    confirmed > 0 ? totalGasUsed / BigInt(confirmed) : 0n;

  printHeader("FOOP COMPLETE");

  const col = 18;
  const rows: Array<[string, string]> = [
    ["Confirmed", green(bold(String(confirmed)))],
    ["Failed", failed > 0 ? red(bold(String(failed))) : dim("0")],
    ["Pending", pending > 0 ? yellow(String(pending)) : dim("0")],
    ["", ""],
    ["Total gas", `${formatEth(totalGasUsed)} ETH`],
    ["Avg gas used", `${avgGas.toLocaleString()} units`],
  ];

  for (const [key, val] of rows) {
    if (key === "" && val === "") { console.log(""); continue; }
    console.log(`  ${dim(rpad(key, col))} ${val}`);
  }

  console.log("");

  if (failed > 0) {
    console.log(red(`  ${failed} transaction(s) failed.`));
    console.log("");
  }
}

// ---------------------------------------------------------------------------
// Single tx record line
// ---------------------------------------------------------------------------

export function printTxLine(opts: {
  index: number;
  total: number;
  hash: string;
  status: "confirmed" | "failed" | "pending";
  gasUsed?: bigint;
  failureReason?: string;
}): void {
  const { index, total, hash, status, gasUsed, failureReason } = opts;
  const pad = String(total).length;
  const num = lpad(String(index), pad);
  const statusStr =
    status === "confirmed"
      ? green("✓")
      : status === "failed"
      ? red("✗")
      : yellow("…");
  const isZeroHash = hash.replace("0x", "").replace(/0/g, "") === "";
  const hashStr = isZeroHash ? red("(not submitted)") : dim(`${hash.slice(0, 20)}…`);
  const gasStr = gasUsed ? dim(`  ${gasUsed.toLocaleString()} gas`) : "";
  console.log(
    `  [${num}/${total}] ${statusStr}  ${hashStr}${gasStr}`
  );
  if (failureReason) {
    // Print full reason across multiple lines if needed
    const lines = failureReason.replace(/\n/g, " ").match(/.{1,100}/g) ?? [];
    for (const line of lines) {
      console.log(`         ${red(dim(line))}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export function printError(message: string): void {
  console.error(`\n  ${red(bold("Error:"))} ${message}\n`);
}

export function printWarning(message: string): void {
  console.warn(`  ${yellow("Warning:")} ${message}`);
}

export function printInfo(message: string): void {
  console.log(`  ${cyan("ℹ")} ${message}`);
}

// ---------------------------------------------------------------------------
// Approval plan
// ---------------------------------------------------------------------------

const UINT256_MAX = (1n << 256n) - 1n;

export function printApprovePlan(opts: {
  token: string;
  spender: string;
  required: bigint;
  current: bigint;
  decimals: number;
}): void {
  const { token, spender, required, current, decimals } = opts;
  const fmt = (v: bigint): string =>
    v === UINT256_MAX ? "unlimited (max)" : formatUnits(v, decimals);

  printHeader("APPROVAL");
  const col = 20;
  const rows: Array<[string, string]> = [
    ["Token", token],
    ["Spender", spender],
    ["Current allowance", fmt(current)],
    ["Required", bold(fmt(required))],
  ];
  for (const [key, val] of rows) {
    console.log(`  ${dim(rpad(key, col))} ${val}`);
  }
  console.log("");
}

export function printSuccess(message: string): void {
  console.log(`  ${green("✓")} ${message}`);
}
