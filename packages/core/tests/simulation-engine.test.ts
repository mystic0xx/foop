import { describe, it, expect, vi } from "vitest";
import type { PublicClient } from "viem";
import { simulateStep, simulateWorkload } from "../src/simulation-engine.js";
import type { WorkloadStep } from "../src/types.js";

// ---------------------------------------------------------------------------
// Mock viem PublicClient
// ---------------------------------------------------------------------------

function makeClient(overrides: Partial<PublicClient> = {}): PublicClient {
  return {
    getChainId: vi.fn().mockResolvedValue(84532),
    getBalance: vi.fn().mockResolvedValue(1_000_000_000_000_000_000n), // 1 ETH
    estimateFeesPerGas: vi.fn().mockResolvedValue({
      maxFeePerGas: 1_000_000_000n,       // 1 gwei
      maxPriorityFeePerGas: 500_000_000n, // 0.5 gwei
    }),
    estimateGas: vi.fn().mockResolvedValue(21_000n),
    call: vi.fn().mockResolvedValue({ data: "0x" }),
    readContract: vi.fn().mockResolvedValue(0n),
    ...overrides,
  } as unknown as PublicClient;
}

const WETH: WorkloadStep = {
  contract: "0x4200000000000000000000000000000000000006",
  function: "deposit()",
  value: "10000000000000000", // 0.01 ETH
  repeat: 5,
  abi: [
    {
      name: "deposit",
      type: "function",
      stateMutability: "payable",
      inputs: [],
      outputs: [],
    },
  ],
};

// ---------------------------------------------------------------------------
// simulateStep
// ---------------------------------------------------------------------------

describe("simulateStep", () => {
  it("returns executable = repeat when wallet has enough balance", async () => {
    const client = makeClient();
    const result = await simulateStep({
      client,
      walletAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      step: WETH,
      stepIndex: 0,
      nativeBalance: 1_000_000_000_000_000_000n, // 1 ETH
      baseFee: 1_000_000_000n,
      priorityFee: 500_000_000n,
    });

    expect(result.executable).toBe(5);
    expect(result.blockedBy).toBe("none");
    expect(result.revertReason).toBeUndefined();
  });

  it("returns executable = 0 and blockedBy = revert when eth_call throws", async () => {
    const client = makeClient({
      call: vi.fn().mockRejectedValue(new Error("execution reverted: insufficient balance")),
    });

    const result = await simulateStep({
      client,
      walletAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      step: WETH,
      stepIndex: 0,
      nativeBalance: 1_000_000_000_000_000_000n,
      baseFee: 1_000_000_000n,
      priorityFee: 500_000_000n,
    });

    expect(result.executable).toBe(0);
    expect(result.blockedBy).toBe("revert");
    expect(result.revertReason).toContain("insufficient balance");
  });

  it("caps executable by native balance when balance is insufficient", async () => {
    const client = makeClient({
      estimateGas: vi.fn().mockResolvedValue(21_000n),
    });

    // Balance only covers ~2 transactions worth of value + gas
    const tightBalance = 25_000_000_000_000_000n; // 0.025 ETH

    const result = await simulateStep({
      client,
      walletAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      step: WETH, // 0.01 ETH per tx
      stepIndex: 0,
      nativeBalance: tightBalance,
      baseFee: 1_000_000_000n,
      priorityFee: 500_000_000n,
    });

    expect(result.executable).toBeLessThan(5);
    expect(result.executable).toBeGreaterThan(0);
    expect(result.blockedBy).toBe("eth_balance");
  });

  it("returns executable = repeat when balance exactly covers all txs", async () => {
    const client = makeClient({
      estimateGas: vi.fn().mockResolvedValue(21_000n),
    });

    const gasPerTx = (21_000n * 12n / 10n) * 1_500_000_000n; // buffered gas cost
    const valuePerTx = 10_000_000_000_000_000n; // 0.01 ETH
    const costPerTx = gasPerTx + valuePerTx;
    const exactBalance = costPerTx * 5n;

    const result = await simulateStep({
      client,
      walletAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      step: WETH,
      stepIndex: 0,
      nativeBalance: exactBalance,
      baseFee: 1_000_000_000n,
      priorityFee: 500_000_000n,
    });

    expect(result.executable).toBe(5);
  });

  it("uses fallback gas estimate when estimateGas throws", async () => {
    const client = makeClient({
      estimateGas: vi.fn().mockRejectedValue(new Error("gas estimation failed")),
    });

    const result = await simulateStep({
      client,
      walletAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      step: WETH,
      stepIndex: 0,
      nativeBalance: 1_000_000_000_000_000_000n,
      baseFee: 1_000_000_000n,
      priorityFee: 500_000_000n,
    });

    // Should not throw — uses 300_000n fallback
    expect(result.gasPerTx).toBe(300_000n * 12n / 10n);
  });
});

// ---------------------------------------------------------------------------
// simulateWorkload
// ---------------------------------------------------------------------------

describe("simulateWorkload", () => {
  it("throws when RPC chain ID does not match workload chain ID", async () => {
    const client = makeClient({
      getChainId: vi.fn().mockResolvedValue(8453), // Base mainnet, not 84532
    });

    await expect(
      simulateWorkload({
        client,
        walletAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        steps: [WETH],
        chainId: 84532,
      })
    ).rejects.toThrow("Chain mismatch");
  });

  it("returns fullyExecutable = true when all steps are within balance", async () => {
    const client = makeClient();

    const result = await simulateWorkload({
      client,
      walletAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      steps: [WETH],
      chainId: 84532,
    });

    expect(result.fullyExecutable).toBe(true);
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].executable).toBe(5);
  });

  it("returns fullyExecutable = false when balance is insufficient", async () => {
    const client = makeClient({
      getBalance: vi.fn().mockResolvedValue(1_000_000_000_000_000n), // 0.001 ETH — not enough for 5×0.01
    });

    const result = await simulateWorkload({
      client,
      walletAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      steps: [WETH],
      chainId: 84532,
    });

    expect(result.fullyExecutable).toBe(false);
    expect(result.steps[0].executable).toBeLessThan(5);
  });
});
