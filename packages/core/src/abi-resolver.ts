import { type Abi, parseAbi } from "viem";

// ---------------------------------------------------------------------------
// Chain → Blockscout base URL mapping
// ---------------------------------------------------------------------------

const BLOCKSCOUT_URLS: Record<number, string> = {
  1: "https://eth.blockscout.com",
  10: "https://optimism.blockscout.com",
  8453: "https://base.blockscout.com",
  84532: "https://base-sepolia.blockscout.com",
  42161: "https://arbitrum.blockscout.com",
  137: "https://polygon.blockscout.com",
  11155111: "https://eth-sepolia.blockscout.com",
};

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class AbiResolveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AbiResolveError";
  }
}

// ---------------------------------------------------------------------------
// Blockscout fetch
// ---------------------------------------------------------------------------

interface BlockscoutContractResponse {
  result: string; // ABI JSON string, or "Contract source code not verified"
  status: string;
  message: string;
}

async function fetchFromBlockscout(
  chainId: number,
  address: string
): Promise<Abi | null> {
  const baseUrl = BLOCKSCOUT_URLS[chainId];
  if (!baseUrl) return null;

  const url = `${baseUrl}/api?module=contract&action=getabi&address=${address}`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return null; // network error — fall through to next strategy
  }

  if (!response.ok) return null;

  const data = (await response.json()) as BlockscoutContractResponse;

  if (data.status !== "1" || !data.result || data.result === "Contract source code not verified") {
    return null;
  }

  try {
    return JSON.parse(data.result) as Abi;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Human-readable signature fallback
// ---------------------------------------------------------------------------

/**
 * Parses a human-readable function signature into a minimal ABI entry.
 * e.g. "deposit()" or "transfer(address,uint256)"
 */
function abiFromSignature(signature: string): Abi {
  // Normalise: ensure it starts with "function " for parseAbi
  const normalised = signature.trimStart().startsWith("function ")
    ? signature
    : `function ${signature}`;

  return parseAbi([normalised]);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ResolvedAbi {
  abi: Abi;
  /** How the ABI was obtained. */
  source: "blockscout" | "provided" | "signature";
}

/**
 * Resolves an ABI for a contract function using the following priority:
 *
 * 1. Caller-supplied ABI (from workload file `abi` field).
 * 2. Verified ABI from Blockscout.
 * 3. Minimal ABI parsed from the human-readable function signature.
 *
 * Throws `AbiResolveError` only if even signature parsing fails.
 */
export async function resolveAbi(opts: {
  chainId: number;
  address: string;
  functionSignature: string;
  providedAbi?: Abi;
}): Promise<ResolvedAbi> {
  const { chainId, address, functionSignature, providedAbi } = opts;

  // 1. Caller-supplied
  if (providedAbi && providedAbi.length > 0) {
    return { abi: providedAbi, source: "provided" };
  }

  // 2. Blockscout
  const blockscoutAbi = await fetchFromBlockscout(chainId, address);
  if (blockscoutAbi) {
    return { abi: blockscoutAbi, source: "blockscout" };
  }

  // 3. Signature fallback
  try {
    const abi = abiFromSignature(functionSignature);
    return { abi, source: "signature" };
  } catch {
    throw new AbiResolveError(
      `Could not resolve ABI for "${functionSignature}". ` +
        `Blockscout lookup failed and the signature could not be parsed. ` +
        `Provide an explicit "abi" field in your workload file.`
    );
  }
}

/**
 * Returns the list of Blockscout-supported chain IDs.
 */
export function supportedChainIds(): number[] {
  return Object.keys(BLOCKSCOUT_URLS).map(Number);
}
