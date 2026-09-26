import {
  type Abi,
  type Address,
  type PublicClient,
  encodeFunctionData,
  getAddress,
} from "viem";
import type { WorkloadApprove, WorkloadFile } from "./types.js";

// ---------------------------------------------------------------------------
// Placeholders
// ---------------------------------------------------------------------------

const AMOUNT_TOKEN = "{amount}";
const COUNT_TOKEN = "{count}";
const RECIPIENT_TOKEN = "{recipient}";

/** uint256 max, used for "max" approvals. */
export const UINT256_MAX = (1n << 256n) - 1n;

/** Minimal ERC-20 fragments for decimals / allowance / approve. */
export const ERC20_MIN_ABI = [
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const satisfies Abi;

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

function valueHasPlaceholder(v: unknown): boolean {
  if (typeof v === "string") return v.includes(AMOUNT_TOKEN) || v.includes(COUNT_TOKEN);
  if (Array.isArray(v)) return v.some(valueHasPlaceholder);
  return false;
}

/**
 * True when the workload needs interactive input: it declares `input` /
 * `approve`, or any step embeds an `{amount}` / `{count}` placeholder.
 */
export function hasInputs(file: WorkloadFile): boolean {
  if (file.input || file.approve) return true;
  return file.steps.some(
    (s) =>
      valueHasPlaceholder(s.args) ||
      valueHasPlaceholder(s.value) ||
      valueHasPlaceholder(s.repeat)
  );
}

// ---------------------------------------------------------------------------
// Substitution
// ---------------------------------------------------------------------------

export interface InputValues {
  /** Amount per transaction, already converted to wei. */
  amountWei: bigint;
  /** Repeat count. */
  count: number;
  /**
   * Address that fills any `{recipient}` placeholder. The CLI passes the
   * signer's address so swap output always lands in the wallet that pays.
   */
  recipient?: Address;
}

function substituteString(s: string, values: InputValues): string {
  let out = s
    .split(AMOUNT_TOKEN)
    .join(values.amountWei.toString())
    .split(COUNT_TOKEN)
    .join(String(values.count));
  if (values.recipient !== undefined) {
    out = out.split(RECIPIENT_TOKEN).join(values.recipient);
  }
  return out;
}

function substituteDeep(v: unknown, values: InputValues): unknown {
  if (typeof v === "string") return substituteString(v, values);
  if (Array.isArray(v)) return v.map((x) => substituteDeep(x, values));
  return v;
}

/**
 * Replaces `{amount}` / `{count}` placeholders throughout every step's
 * `args`, `value`, and `repeat`, returning a new resolved WorkloadFile with
 * numeric `repeat`. Runs before validation/simulation.
 */
export function applyWorkloadInputs(
  file: WorkloadFile,
  values: InputValues
): WorkloadFile {
  const steps = file.steps.map((step) => {
    const resolved = { ...step };

    if (resolved.args !== undefined) {
      resolved.args = substituteDeep(resolved.args, values) as unknown[];
    }
    if (typeof resolved.value === "string") {
      resolved.value = substituteString(resolved.value, values);
    }

    const repeatRaw =
      typeof resolved.repeat === "string"
        ? substituteString(resolved.repeat, values)
        : resolved.repeat;
    const repeatNum =
      typeof repeatRaw === "number" ? repeatRaw : Number(repeatRaw);
    if (!Number.isInteger(repeatNum)) {
      throw new Error(
        `Step repeat resolved to a non-integer ("${String(resolved.repeat)}" → "${String(repeatRaw)}").`
      );
    }
    resolved.repeat = repeatNum;

    return resolved;
  });

  return { ...file, steps };
}

// ---------------------------------------------------------------------------
// Approval planning
// ---------------------------------------------------------------------------

export interface ApprovalPlan {
  token: Address;
  spender: Address;
  /** Amount to approve, in wei. */
  required: bigint;
}

/**
 * Resolves the workload's approval target and required amount. Returns null
 * when the workload declares no `approve` block.
 */
export function planApproval(
  file: WorkloadFile,
  values: InputValues
): ApprovalPlan | null {
  const approve = file.approve;
  if (!approve) return null;

  const spender = approve.spender ?? file.steps[0]?.contract;
  if (!spender) {
    throw new Error("approve.spender is required when the workload has no steps.");
  }

  const mode = approve.amount ?? "total";
  let required: bigint;
  if (mode === "total") {
    required = values.amountWei * BigInt(values.count);
  } else if (mode === "max") {
    required = UINT256_MAX;
  } else {
    try {
      required = BigInt(mode);
    } catch {
      throw new Error(
        `approve.amount must be "total", "max", or a wei integer string, got "${mode}".`
      );
    }
  }

  return {
    token: getAddress(approve.token),
    spender: getAddress(spender),
    required,
  };
}

// ---------------------------------------------------------------------------
// ERC-20 reads / encode
// ---------------------------------------------------------------------------

export async function readDecimals(
  client: PublicClient,
  token: Address
): Promise<number> {
  const d = await client.readContract({
    address: token,
    abi: ERC20_MIN_ABI,
    functionName: "decimals",
  });
  return Number(d);
}

export async function readAllowance(
  client: PublicClient,
  token: Address,
  owner: Address,
  spender: Address
): Promise<bigint> {
  return client.readContract({
    address: token,
    abi: ERC20_MIN_ABI,
    functionName: "allowance",
    args: [owner, spender],
  });
}

export function encodeApprove(spender: Address, value: bigint): `0x${string}` {
  return encodeFunctionData({
    abi: ERC20_MIN_ABI,
    functionName: "approve",
    args: [spender, value],
  });
}
