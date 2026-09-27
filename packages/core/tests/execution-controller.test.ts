import { describe, it, expect, vi } from "vitest";
import type { PublicClient, WalletClient, Account, Abi } from "viem";
import {
  executeWorkload,
  executeWorkloadStaged,
} from "../src/execution-controller.js";
import type { WorkloadStep } from "../src/types.js";

// ---------------------------------------------------------------------------
// Fixtures — a two-step "supply then borrow" dependency, the canonical case
// staged execution exists to handle.
// ---------------------------------------------------------------------------

const ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as const;
const account = { address: ADDRESS } as unknown as Account;

const DEPOSIT_ABI: Abi = [
  { name: "deposit", type: "function", stateMutability: "payable", inputs: [], outputs: [] },
];
const BORROW_ABI: Abi = [
  { name: "borrow", type: "function", stateMutability: "nonpayable", inputs: [], outputs: [] },
];

const SUPPLY: WorkloadStep = {
  contract: "0x1111111111111111111111111111111111111111",
  function: "deposit()",
  value: "10000000000000000", // 0.01 ETH
  repeat: 2,
  abi: DEPOSIT_ABI,
};
const BORROW: WorkloadStep = {
  contract: "0x2222222222222222222222222222222222222222",
  function: "borrow()",
  repeat: 1,
  abi: BORROW_ABI,
};

// ---------------------------------------------------------------------------
// Mock client + wallet. `call` drives simulateStep's revert detection;
// `waitForTransactionReceipt` drives on-chain success/failure.
// ---------------------------------------------------------------------------

interface Harness {
  client: PublicClient;
  wallet: WalletClient;
  /** Contract addresses that actually received a sendTransaction, in order. */
  sent: string[];
}

function makeHarness(
  opts: {
    call?: (to: string) => Promise<{ data: string }>;
    receiptStatus?: (to: string) => "success" | "reverted";
    onSend?: (to: string) => void;
  } = {}
): Harness {
  const sent: string[] = [];
  const hashTo: Record<string, string> = {};
  let n = 0;

  const client = {
    getChainId: vi.fn().mockResolvedValue(84532),
    getBalance: vi.fn().mockResolvedValue(1_000_000_000_000_000_000n), // 1 ETH
    estimateFeesPerGas: vi.fn().mockResolvedValue({
      maxFeePerGas: 1_000_000_000n,
      maxPriorityFeePerGas: 500_000_000n,
    }),
    estimateGas: vi.fn().mockResolvedValue(21_000n),
    call: vi.fn(async ({ to }: { to: string }) =>
      opts.call ? opts.call(to) : { data: "0x" }
    ),
    readContract: vi.fn().mockResolvedValue(0n),
    getTransactionCount: vi.fn().mockResolvedValue(0),
    waitForTransactionReceipt: vi.fn(async ({ hash }: { hash: string }) => {
      const to = hashTo[hash] ?? "";
      const status = opts.receiptStatus ? opts.receiptStatus(to) : "success";
      return { status, gasUsed: 21_000n, blockNumber: 1n };
    }),
  } as unknown as PublicClient;
// __APPEND__

  const wallet = {
    sendTransaction: vi.fn(async ({ to }: { to: string }) => {
      sent.push(to);
      opts.onSend?.(to);
      const hash = `0x${(++n).toString(16).padStart(64, "0")}`;
      hashTo[hash] = to;
      return hash;
    }),
  } as unknown as WalletClient;

  return { client, wallet, sent };
}

const only = (sent: string[], contract: string): number =>
  sent.filter((a) => a === contract).length;

// ---------------------------------------------------------------------------
// executeWorkloadStaged
// ---------------------------------------------------------------------------

describe("executeWorkloadStaged", () => {
  it("runs a dependent step once an earlier step has created its precondition", async () => {
    // borrow reverts in simulation until the supply has run — exactly the case
    // that up-front simulation gets wrong and staged re-simulation gets right.
    let supplyRan = false;
    const h = makeHarness({
      call: async (to) => {
        if (to === BORROW.contract && !supplyRan) throw new Error("reverted");
        return { data: "0x" };
      },
      onSend: (to) => {
        if (to === SUPPLY.contract) supplyRan = true;
      },
    });

    const res = await executeWorkloadStaged({
      client: h.client,
      wallet: h.wallet,
      account,
      steps: [SUPPLY, BORROW],
      chainId: 84532,
    });

    expect(res.confirmed).toBe(3); // 2 supply + 1 borrow
    expect(res.failed).toBe(0);
    expect(res.haltReason).toBeUndefined();
    expect(only(h.sent, SUPPLY.contract)).toBe(2);
    expect(only(h.sent, BORROW.contract)).toBe(1);
  });
// __APPEND2__

  it("halts and skips dependent steps when a step is fully blocked", async () => {
    const h = makeHarness({
      call: async (to) => {
        if (to === SUPPLY.contract) throw new Error("reverted");
        return { data: "0x" };
      },
    });

    const res = await executeWorkloadStaged({
      client: h.client,
      wallet: h.wallet,
      account,
      steps: [SUPPLY, BORROW],
      chainId: 84532,
    });

    expect(res.confirmed).toBe(0);
    expect(res.submitted).toBe(0);
    expect(res.skipped).toBe(3); // 2 supply + 1 borrow, none run
    expect(res.haltReason).toBeDefined();
    expect(h.sent).toHaveLength(0);
  });

  it("halts dependent steps when an earlier step fails on-chain", async () => {
    const h = makeHarness({
      receiptStatus: (to) => (to === SUPPLY.contract ? "reverted" : "success"),
    });

    const res = await executeWorkloadStaged({
      client: h.client,
      wallet: h.wallet,
      account,
      steps: [SUPPLY, BORROW],
      chainId: 84532,
    });

    expect(res.failed).toBeGreaterThan(0);
    expect(res.haltReason).toMatch(/failed/i);
    // borrow depended on supply; it must never have been sent
    expect(only(h.sent, BORROW.contract)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// executeWorkload (regression — up-front executor behavior preserved)
// ---------------------------------------------------------------------------

describe("executeWorkload", () => {
  it("skips only the zero-count step and runs the others", async () => {
    const h = makeHarness();

    const res = await executeWorkload({
      client: h.client,
      wallet: h.wallet,
      account,
      steps: [SUPPLY, BORROW],
      executableCounts: [0, 1],
      chainId: 84532,
    });

    expect(res.confirmed).toBe(1);
    expect(only(h.sent, SUPPLY.contract)).toBe(0);
    expect(only(h.sent, BORROW.contract)).toBe(1);
  });
});
