import { describe, it, expect } from "vitest";
import { parseUnits } from "viem";
import {
  hasInputs,
  applyWorkloadInputs,
  planApproval,
  UINT256_MAX,
} from "../src/workload-input.js";
import type { WorkloadFile } from "../src/types.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TOKEN = "0x0d442EC7BdDB06b531DCA3Dd39ABaFf554170776" as const;
const ROUTER = "0xC7dbf300B6aEA3CFE1730f1C692C606b17B514a6" as const;
const RECIPIENT = "0xba954E89cE301415964E9405f09F4Cc7c668976A" as const;

/** Swap workload using {amount} in a nested tuple arg and {count} as repeat. */
const swapWorkload: WorkloadFile = {
  version: "1",
  chain: 84532,
  input: { amountToken: TOKEN, amountPrompt: "Amount", countPrompt: "Count" },
  approve: { token: TOKEN, spender: ROUTER, amount: "total" },
  steps: [
    {
      contract: ROUTER,
      function:
        "exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))",
      args: [
        [
          TOKEN,
          "0xD385d2Da758027a7a7D9a06139c6c53B2a8c284C",
          "10000",
          RECIPIENT,
          "4102444800",
          "{amount}",
          "0",
          "0",
        ],
      ],
      repeat: "{count}",
    },
  ],
};

const plainWorkload: WorkloadFile = {
  version: "1",
  chain: 84532,
  steps: [
    { contract: ROUTER, function: "deposit()", value: "1000", repeat: 3 },
  ],
};

// ---------------------------------------------------------------------------
// hasInputs
// ---------------------------------------------------------------------------

describe("hasInputs", () => {
  it("is true when an input block is present", () => {
    expect(hasInputs(swapWorkload)).toBe(true);
  });

  it("is true when a placeholder appears with no input block", () => {
    const f: WorkloadFile = {
      version: "1",
      chain: 1,
      steps: [{ contract: ROUTER, function: "f(uint256)", args: ["{amount}"], repeat: 1 }],
    };
    expect(hasInputs(f)).toBe(true);
  });

  it("is false for a plain workload", () => {
    expect(hasInputs(plainWorkload)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// applyWorkloadInputs
// ---------------------------------------------------------------------------

describe("applyWorkloadInputs", () => {
  it("substitutes {amount} inside a nested tuple arg and {count} in repeat", () => {
    const amountWei = parseUnits("20", 18); // 20 GYND → 20e18
    const resolved = applyWorkloadInputs(swapWorkload, { amountWei, count: 10 });

    const tuple = resolved.steps[0].args?.[0] as string[];
    expect(tuple[5]).toBe("20000000000000000000");
    expect(resolved.steps[0].repeat).toBe(10);
    // Other tuple entries are untouched.
    expect(tuple[0]).toBe(TOKEN);
    expect(tuple[2]).toBe("10000");
  });

  it("substitutes {amount} in a step value", () => {
    const f: WorkloadFile = {
      version: "1",
      chain: 1,
      steps: [{ contract: ROUTER, function: "deposit()", value: "{amount}", repeat: "{count}" }],
    };
    const resolved = applyWorkloadInputs(f, { amountWei: 500n, count: 4 });
    expect(resolved.steps[0].value).toBe("500");
    expect(resolved.steps[0].repeat).toBe(4);
  });

  it("does not mutate the original workload", () => {
    applyWorkloadInputs(swapWorkload, { amountWei: 1n, count: 1 });
    expect(swapWorkload.steps[0].repeat).toBe("{count}");
  });

  it("substitutes {recipient} with the provided address", () => {
    const f: WorkloadFile = {
      version: "1",
      chain: 1,
      input: { amountToken: TOKEN },
      steps: [
        {
          contract: ROUTER,
          function: "swap(address,uint256)",
          args: [["{recipient}", "{amount}"]],
          repeat: "{count}",
        },
      ],
    };
    const resolved = applyWorkloadInputs(f, {
      amountWei: 5n,
      count: 2,
      recipient: RECIPIENT,
    });
    const tuple = resolved.steps[0].args?.[0] as string[];
    expect(tuple[0]).toBe(RECIPIENT);
    expect(tuple[1]).toBe("5");
  });

  it("leaves {recipient} untouched when no recipient is provided", () => {
    const f: WorkloadFile = {
      version: "1",
      chain: 1,
      steps: [{ contract: ROUTER, function: "f(address)", args: ["{recipient}"], repeat: 1 }],
    };
    const resolved = applyWorkloadInputs(f, { amountWei: 0n, count: 1 });
    expect(resolved.steps[0].args?.[0]).toBe("{recipient}");
  });

  it("throws when repeat resolves to a non-integer", () => {
    const f: WorkloadFile = {
      version: "1",
      chain: 1,
      steps: [{ contract: ROUTER, function: "f()", repeat: "not-a-number" }],
    };
    expect(() => applyWorkloadInputs(f, { amountWei: 0n, count: 1 })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// planApproval
// ---------------------------------------------------------------------------

describe("planApproval", () => {
  it("computes total = amountWei × count", () => {
    const amountWei = parseUnits("20", 18);
    const plan = planApproval(swapWorkload, { amountWei, count: 10 });
    expect(plan).not.toBeNull();
    expect(plan?.required).toBe(amountWei * 10n);
    expect(plan?.token).toBe(TOKEN);
    expect(plan?.spender).toBe(ROUTER);
  });

  it("computes max as uint256 max", () => {
    const f: WorkloadFile = { ...swapWorkload, approve: { token: TOKEN, spender: ROUTER, amount: "max" } };
    const plan = planApproval(f, { amountWei: 1n, count: 1 });
    expect(plan?.required).toBe(UINT256_MAX);
  });

  it("accepts an explicit wei amount", () => {
    const f: WorkloadFile = { ...swapWorkload, approve: { token: TOKEN, spender: ROUTER, amount: "12345" } };
    const plan = planApproval(f, { amountWei: 1n, count: 99 });
    expect(plan?.required).toBe(12345n);
  });

  it("defaults spender to the first step's contract", () => {
    const f: WorkloadFile = { ...swapWorkload, approve: { token: TOKEN } };
    const plan = planApproval(f, { amountWei: 1n, count: 1 });
    expect(plan?.spender).toBe(ROUTER);
  });

  it("returns null when no approve block is declared", () => {
    expect(planApproval(plainWorkload, { amountWei: 1n, count: 1 })).toBeNull();
  });
});
