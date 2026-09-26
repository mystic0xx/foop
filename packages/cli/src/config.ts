import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface CliConfig {
  privateKey: `0x${string}` | undefined;
  rpcUrl: string | undefined;
}

export function loadConfig(): CliConfig {
  return {
    privateKey: process.env.FOOP_PRIVATE_KEY as `0x${string}` | undefined,
    rpcUrl: process.env.FOOP_RPC_URL,
  };
}

/**
 * Reads and parses a workload JSON file from the given path.
 * Throws with a clear message if the file is missing or malformed.
 */
export function readWorkloadFile(filePath: string): unknown {
  const absPath = resolve(process.cwd(), filePath);
  let raw: string;
  try {
    raw = readFileSync(absPath, "utf-8");
  } catch {
    throw new Error(`Could not read workload file: ${absPath}`);
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`Workload file is not valid JSON: ${absPath}`);
  }
}
