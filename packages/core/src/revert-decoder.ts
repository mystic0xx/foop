import { type Abi, type Hex, decodeErrorResult, parseAbiItem } from "viem";

// ---------------------------------------------------------------------------
// Revert decoding
//
// viem's `client.call` throws a wrapped error whose top-level `.message` is a
// generic "execution reverted for an unknown reason" when it can't decode the
// revert data locally. The real information — an ABI-encoded error — is buried
// in the error's cause chain as a hex `data` field. This module digs it out and
// decodes it: standard `Error(string)` / `Panic(uint256)`, any custom error in
// the step ABI, and finally a 4-byte selector lookup against openchain.xyz for
// unverified contracts.
// ---------------------------------------------------------------------------

const ERROR_STRING_SELECTOR = "0x08c379a0"; // Error(string)
const PANIC_SELECTOR = "0x4e487b71"; // Panic(uint256)

const PANIC_REASONS: Record<number, string> = {
  0x01: "assertion failed",
  0x11: "arithmetic overflow/underflow",
  0x12: "division or modulo by zero",
  0x21: "invalid enum value",
  0x22: "storage byte array incorrectly encoded",
  0x31: "pop() on empty array",
  0x32: "array index out of bounds",
  0x41: "out of memory",
  0x51: "called an uninitialized internal function",
};

/**
 * Walks a thrown error (and its `.cause` chain) looking for ABI-encoded revert
 * data — a hex string. Returns `undefined` when the revert carried no data
 * (e.g. an out-of-gas or a bare `require` with no message).
 */
export function extractRevertData(err: unknown): Hex | undefined {
  const seen = new Set<unknown>();
  let cur: unknown = err;
  let sawEmpty = false;
  while (cur && typeof cur === "object" && !seen.has(cur)) {
    seen.add(cur);
    const rec = cur as Record<string, unknown>;
    const candidates = [rec.data, rec.raw];
    for (const cand of candidates) {
      if (typeof cand === "string" && cand.startsWith("0x")) {
        if (cand.length >= 10) return cand as Hex;
        if (cand === "0x") sawEmpty = true;
      }
      // Some viem errors nest as { data: { data: "0x.." } }
      if (cand && typeof cand === "object") {
        const inner = (cand as Record<string, unknown>).data;
        if (typeof inner === "string" && inner.startsWith("0x")) {
          if (inner.length >= 10) return inner as Hex;
          if (inner === "0x") sawEmpty = true;
        }
      }
    }
    cur = rec.cause;
  }
  // Real error data wins; otherwise report an explicit empty ("0x") revert so
  // the caller can distinguish a data-less revert from no revert data at all.
  return sawEmpty ? ("0x" as Hex) : undefined;
}

/** Decodes the well-known Error(string) / Panic(uint256) selectors. Sync. */
function decodeStandard(data: Hex): string | undefined {
  const selector = data.slice(0, 10).toLowerCase();
  if (selector === ERROR_STRING_SELECTOR) {
    try {
      const decoded = decodeErrorResult({
        abi: [parseAbiItem("error Error(string reason)")] as unknown as Abi,
        data,
      });
      return `reverted: ${String(decoded.args?.[0] ?? "")}`;
    } catch {
      return undefined;
    }
  }
  if (selector === PANIC_SELECTOR) {
    try {
      const decoded = decodeErrorResult({
        abi: [parseAbiItem("error Panic(uint256 code)")] as unknown as Abi,
        data,
      });
      const code = Number(decoded.args?.[0] ?? 0n);
      const reason = PANIC_REASONS[code] ?? `code 0x${code.toString(16)}`;
      return `panic: ${reason}`;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** Tries to decode the revert as a custom error declared in the given ABI. */
function decodeFromAbi(data: Hex, abi: Abi | undefined): string | undefined {
  if (!abi || abi.length === 0) return undefined;
  try {
    const decoded = decodeErrorResult({ abi, data });
    return formatCustomError(decoded.errorName, decoded.args as readonly unknown[] | undefined);
  } catch {
    return undefined;
  }
}

function formatCustomError(name: string, args: readonly unknown[] | undefined): string {
  const argStr = (args ?? []).map((a) => stringifyArg(a)).join(", ");
  return argStr ? `${name}(${argStr})` : `${name}()`;
}

function stringifyArg(a: unknown): string {
  if (typeof a === "bigint") return a.toString();
  if (typeof a === "string") return a;
  if (Array.isArray(a)) return `[${a.map(stringifyArg).join(", ")}]`;
  return String(a);
}

// ---------------------------------------------------------------------------
// openchain.xyz 4-byte selector lookup (best-effort, network)
// ---------------------------------------------------------------------------

/**
 * Looks a 4-byte selector up in openchain.xyz's signature database and returns
 * the candidate signatures (e.g. "InsufficientReputation(uint256,uint256)").
 * Errors share the function selector space, so we query the `function` field.
 */
async function lookupSelector(selector: Hex): Promise<string[]> {
  const url =
    `https://api.openchain.xyz/signature-database/v1/lookup` +
    `?function=${selector}&filter=true`;
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(3_000),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      result?: { function?: Record<string, { name: string }[] | undefined> };
    };
    const entries = json.result?.function?.[selector] ?? [];
    return entries.map((e) => e.name).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Given a candidate signature and the raw data, decode the arguments so the
 * error is shown fully resolved, e.g. "InsufficientReputation(0, 10000)".
 * Falls back to just the error name when the args can't be decoded.
 */
function decodeWithSignature(signature: string, data: Hex): string | undefined {
  try {
    const abi = [parseAbiItem(`error ${signature}`)] as unknown as Abi;
    const decoded = decodeErrorResult({ abi, data });
    return formatCustomError(decoded.errorName, decoded.args as readonly unknown[] | undefined);
  } catch {
    // Selector matched but arg types differ (collision) — name only.
    const name = signature.split("(")[0];
    return `${name} (selector ${data.slice(0, 10)})`;
  }
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export interface DecodeRevertOptions {
  /** Step ABI — may carry custom error fragments to decode locally. */
  abi?: Abi;
  /** Set false to skip the network selector lookup. Default true. */
  lookup?: boolean;
}

/**
 * Produces a clean, single-line revert reason from a thrown viem call error.
 * Order: extract data → Error/Panic → step ABI custom error → openchain
 * selector lookup (+ arg decode) → raw selector → cleaned error message.
 */
export async function decodeRevertReason(
  err: unknown,
  opts: DecodeRevertOptions = {}
): Promise<string> {
  const data = extractRevertData(err);

  if (!data || data === "0x") {
    if (data === "0x") {
      // The revert carried no return data — a bare require()/revert with no
      // message. The most common causes are worth naming outright.
      return (
        "reverted with no reason data — a failed require()/revert with no " +
        "message (e.g. insufficient token allowance or balance) or out of gas"
      );
    }
    // No revert data anywhere in the error. If the node reported a bare
    // "execution reverted" with nothing to decode, viem surfaces an opaque
    // "unknown reason" — replace that with something actionable, but keep any
    // real reason the node did put in the message.
    const msg = cleanMessage(err);
    if (/reverted for an unknown reason|execution reverted\.?$/i.test(msg)) {
      return (
        "execution reverted, but the RPC returned no revert data to decode — " +
        "commonly a failed require() (insufficient token allowance or balance) " +
        "or an unmet precondition from an earlier step (e.g. supply before " +
        "approve, borrow before collateral). A node that returns revert data " +
        "will give the exact reason."
      );
    }
    return msg;
  }

  const standard = decodeStandard(data);
  if (standard) return standard;

  const fromAbi = decodeFromAbi(data, opts.abi);
  if (fromAbi) return fromAbi;

  const selector = data.slice(0, 10) as Hex;
  if (opts.lookup !== false) {
    const candidates = await lookupSelector(selector);
    for (const sig of candidates) {
      const decoded = decodeWithSignature(sig, data);
      if (decoded) return `custom error ${decoded}`;
    }
  }

  return `custom error with selector ${selector} (unverified contract — no ABI to decode)`;
}

/** Reduce a noisy multi-line viem error to its first meaningful line. */
function cleanMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const firstLine = msg.split("\n").map((l) => l.trim()).find((l) => l.length > 0);
  return firstLine ?? "execution reverted";
}

