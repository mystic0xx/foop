import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  appendFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { Address } from "viem";
import type { WorkloadFile } from "@foop/core";
import { readWorkloadFile } from "./config.js";

// ---------------------------------------------------------------------------
// Store location — ~/.foop by default, override with FOOP_HOME.
// ---------------------------------------------------------------------------

export function foopHome(): string {
  return process.env.FOOP_HOME ?? join(homedir(), ".foop");
}

function workloadsDir(): string {
  return join(foopHome(), "workloads");
}

function userTemplatesDir(): string {
  return join(foopHome(), "templates");
}

function historyFile(): string {
  return join(foopHome(), "history.jsonl");
}

/** Creates the store directories if missing. Called only from write paths. */
function ensureStore(): void {
  mkdirSync(workloadsDir(), { recursive: true });
  mkdirSync(userTemplatesDir(), { recursive: true });
}

// ---------------------------------------------------------------------------
// Name validation — a saved name becomes a filename, so keep it a safe slug.
// ---------------------------------------------------------------------------

const NAME_RE = /^[a-z0-9][a-z0-9._-]*$/i;

export function assertValidName(name: string): void {
  if (!NAME_RE.test(name) || name.includes("..")) {
    throw new Error(
      `Invalid name "${name}". Use letters, digits, "." "_" "-" (no path separators).`
    );
  }
}

// ---------------------------------------------------------------------------
// Lightweight structural check — a saved workload may still hold placeholders,
// so we do NOT run the planner's validateWorkload (which requires resolved
// inputs). We only confirm the shape is a workload file.
// ---------------------------------------------------------------------------

export function assertWorkloadShape(file: unknown): asserts file is WorkloadFile {
  const f = file as Partial<WorkloadFile> | null;
  if (!f || typeof f !== "object") {
    throw new Error("Not a workload object.");
  }
  if (f.version !== "1") {
    throw new Error(`Unsupported workload version "${String(f.version)}". Expected "1".`);
  }
  if (typeof f.chain !== "number") {
    throw new Error('Workload "chain" must be a number.');
  }
  if (!Array.isArray(f.steps) || f.steps.length === 0) {
    throw new Error("Workload must contain at least one step.");
  }
  for (let i = 0; i < f.steps.length; i++) {
    const s = f.steps[i];
    if (!s || typeof s.contract !== "string" || typeof s.function !== "string") {
      throw new Error(`Step ${i + 1}: "contract" and "function" are required.`);
    }
  }
}

// ---------------------------------------------------------------------------
// Saved workloads
// ---------------------------------------------------------------------------

export interface SavedWorkloadInfo {
  name: string;
  chain: number;
  steps: number;
  path: string;
}

export function saveWorkload(name: string, file: WorkloadFile): string {
  assertValidName(name);
  assertWorkloadShape(file);
  ensureStore();
  const path = join(workloadsDir(), `${name}.json`);
  writeFileSync(path, JSON.stringify(file, null, 2) + "\n", "utf-8");
  return path;
}

export function loadWorkload(name: string): WorkloadFile | null {
  const path = join(workloadsDir(), `${name}.json`);
  if (!existsSync(path)) return null;
  const file = JSON.parse(readFileSync(path, "utf-8")) as WorkloadFile;
  return file;
}

export function listWorkloads(): SavedWorkloadInfo[] {
  const dir = workloadsDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const name = f.replace(/\.json$/, "");
      const path = join(dir, f);
      try {
        const file = JSON.parse(readFileSync(path, "utf-8")) as WorkloadFile;
        return { name, chain: file.chain, steps: file.steps?.length ?? 0, path };
      } catch {
        return { name, chain: 0, steps: 0, path };
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function removeWorkload(name: string): boolean {
  const path = join(workloadsDir(), `${name}.json`);
  if (!existsSync(path)) return false;
  rmSync(path);
  return true;
}

// ---------------------------------------------------------------------------
// Resolve a run/simulate argument: an existing file path OR a saved name.
// ---------------------------------------------------------------------------

export interface ResolvedWorkload {
  file: WorkloadFile;
  /** Human label for the source: the file path or "saved:<name>". */
  source: string;
}

export function resolveWorkloadArg(arg: string): ResolvedWorkload {
  // A real file on disk wins (covers "swap.json", "./path/x.json", abs paths).
  const asPath = resolve(process.cwd(), arg);
  if (existsSync(asPath)) {
    return { file: readWorkloadFile(arg) as WorkloadFile, source: arg };
  }
  // Otherwise treat it as a saved workload name.
  const saved = loadWorkload(arg);
  if (saved) {
    return { file: saved, source: `saved:${arg}` };
  }
  throw new Error(
    `No workload file or saved workload named "${arg}". ` +
      `Pass a path to a .json file, or run \`foop list\` to see saved workloads.`
  );
}

// ---------------------------------------------------------------------------
// History (append-only JSONL; single-user, best-effort, no file locking).
// ---------------------------------------------------------------------------

export interface HistoryRecord {
  id: string;
  ts: string;
  source: string;
  chain: number;
  wallet: Address;
  requested: number;
  confirmed: number;
  failed: number;
  totalGasUsed: string;
  txHashes: string[];
}

export function appendHistory(record: HistoryRecord): void {
  try {
    ensureStore();
    appendFileSync(historyFile(), JSON.stringify(record) + "\n", "utf-8");
  } catch {
    // History is best-effort: never let a logging failure abort a run.
  }
}

export function readHistory(opts: { limit?: number; source?: string } = {}): HistoryRecord[] {
  const path = historyFile();
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, "utf-8").split("\n").filter(Boolean);
  let records: HistoryRecord[] = [];
  for (const line of lines) {
    try {
      records.push(JSON.parse(line) as HistoryRecord);
    } catch {
      // skip malformed lines
    }
  }
  records.reverse(); // newest first
  if (opts.source) records = records.filter((r) => r.source === opts.source);
  if (opts.limit) records = records.slice(0, opts.limit);
  return records;
}
