import { formatEth, printHeader, printInfo } from "../renderer/progress.js";
import { readHistory } from "../store.js";

// ---------------------------------------------------------------------------
// foop history [name] [--limit N] [--json]
// ---------------------------------------------------------------------------

export async function runHistory(args: string[]): Promise<void> {
  const asJson = args.includes("--json");
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx !== -1 ? Number(args[limitIdx + 1]) : 20;
  const nameArg = args.find((a) => !a.startsWith("-") && a !== String(limit));

  const source = nameArg ? undefined : undefined; // name filter matches "saved:<name>" or a path below
  const records = readHistory({ limit: Number.isFinite(limit) ? limit : 20 });

  const filtered = nameArg
    ? records.filter((r) => r.source === nameArg || r.source === `saved:${nameArg}`)
    : records;
  void source;

  if (asJson) {
    console.log(JSON.stringify(filtered, null, 2));
    return;
  }

  printHeader("RUN HISTORY");
  if (filtered.length === 0) {
    console.log("  (no runs recorded yet)\n");
    return;
  }

  for (const r of filtered) {
    const when = r.ts.replace("T", " ").replace(/\.\d+Z$/, "Z");
    const status = `${r.confirmed} ok`.padEnd(7) + (r.failed > 0 ? ` ${r.failed} failed` : "");
    console.log(`  ${when}  ${r.source}`);
    console.log(
      `    chain ${r.chain}  ·  ${status}  ·  ${formatEth(BigInt(r.totalGasUsed))} ETH gas  ·  ${r.wallet.slice(0, 10)}…`
    );
  }
  console.log("");
  printInfo("Show as JSON with --json, filter by name, or --limit N.");
}
