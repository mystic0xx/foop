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
// Etherscan V2 fetch (multichain — one key, one endpoint, chainid param)
//
// Etherscan's V2 API routes every supported chain through a single host using
// the `chainid` query param, so one ETHERSCAN_API_KEY covers Ethereum, Base,
// Arbitrum, Optimism, Polygon, and their testnets. Without a key we skip it
// (the endpoint requires one), letting the keyless Sourcify strategy try next.
// The response is Etherscan-shaped, identical to Blockscout's getabi.
// ---------------------------------------------------------------------------

const ETHERSCAN_V2_API = "https://api.etherscan.io/v2/api";

async function fetchFromEtherscan(
  chainId: number,
  address: string
): Promise<Abi | null> {
  const apiKey = process.env.ETHERSCAN_API_KEY;
  if (!apiKey) return null; // no key — Etherscan V2 rejects keyless requests

  const url =
    `${ETHERSCAN_V2_API}?chainid=${chainId}` +
    `&module=contract&action=getabi&address=${address}&apikey=${apiKey}`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return null;
  }

  if (!response.ok) return null;

  const data = (await response.json()) as BlockscoutContractResponse;

  if (
    data.status !== "1" ||
    !data.result ||
    data.result === "Contract source code not verified"
  ) {
    return null;
  }

  try {
    return JSON.parse(data.result) as Abi;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Sourcify fetch (keyless, multichain)
//
// Sourcify hosts verified contract ABIs for a broad set of chains with no API
// key. We use its v2 server API, which returns the ABI directly (plus a
// full/partial `match` field); an unverified contract responds 404.
// ---------------------------------------------------------------------------

interface SourcifyV2Response {
  abi?: Abi;
  match?: string | null;
}

async function fetchFromSourcify(
  chainId: number,
  address: string
): Promise<Abi | null> {
  const url = `https://sourcify.dev/server/v2/contract/${chainId}/${address}?fields=abi`;
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null; // 404 = not verified on Sourcify
    const data = (await response.json()) as SourcifyV2Response;
    if (data.abi && data.abi.length > 0) return data.abi;
  } catch {
    // network error or bad JSON — fall through to the next strategy
  }
  return null;
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
  source: "blockscout" | "etherscan" | "sourcify" | "provided" | "signature";
}

/**
 * Resolves an ABI for a contract function using the following priority:
 *
 * 1. Caller-supplied ABI (from workload file `abi` field).
 * 2. Verified ABI from Blockscout.
 * 3. Verified ABI from Etherscan V2 (requires ETHERSCAN_API_KEY).
 * 4. Verified ABI from Sourcify (keyless).
 * 5. Minimal ABI parsed from the human-readable function signature.
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

  // 3. Etherscan V2 (multichain, keyed)
  const etherscanAbi = await fetchFromEtherscan(chainId, address);
  if (etherscanAbi) {
    return { abi: etherscanAbi, source: "etherscan" };
  }

  // 4. Sourcify (keyless)
  const sourcifyAbi = await fetchFromSourcify(chainId, address);
  if (sourcifyAbi) {
    return { abi: sourcifyAbi, source: "sourcify" };
  }

  // 5. Signature fallback
  try {
    const abi = abiFromSignature(functionSignature);
    return { abi, source: "signature" };
  } catch {
    throw new AbiResolveError(
      `Could not resolve ABI for "${functionSignature}". ` +
        `Blockscout, Etherscan, and Sourcify lookups failed and the signature ` +
        `could not be parsed. Provide an explicit "abi" field in your workload file.`
    );
  }
}

/**
 * Returns the list of Blockscout-supported chain IDs.
 */
export function supportedChainIds(): number[] {
  return Object.keys(BLOCKSCOUT_URLS).map(Number);
}
