import { describe, it, expect } from "vitest";
import { validateWorkload, isMainnet } from "../src/workload-planner.js";
import type { WorkloadFile } from "../src/types.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const validWorkload: WorkloadFile = {
  version: "1",
  chain: 84532,
  steps: [
    {
      contract: "0x4200000000000000000000000000000000000006",
      function: "deposit()",
      value: "10000000000000000",
      repeat: 5,
    },
  ],
};

// ---------------------------------------------------------------------------
// validateWorkload
// ---------------------------------------------------------------------------

describe("validateWorkload", () => {
  it("passes a valid workload without errors", () => {
    expect(() => validateWorkload(validWorkload)).not.toThrow();
  });

  it("throws on unsupported version", () => {
    expect(() =>
      validateWorkload({ ...validWorkload, version: "2" as "1" })
    ).toThrow('Unsupported workload version "2"');
  });

  it("throws on invalid chain ID", () => {
    expect(() =>
      validateWorkload({ ...validWorkload, chain: -1 })
    ).toThrow("Invalid chain ID");
  });

  it("throws on empty steps array", () => {
    expect(() =>
      validateWorkload({ ...validWorkload, steps: [] })
    ).toThrow("at least one step");
  });

  it("throws on invalid contract address", () => {
    expect(() =>
      validateWorkload({
        ...validWorkload,
        steps: [{ ...validWorkload.steps[0], contract: "not-an-address" as `0x${string}` }],
      })
    ).toThrow("invalid contract address");
  });

  it("throws on missing function", () => {
    expect(() =>
      validateWorkload({
        ...validWorkload,
        steps: [{ ...validWorkload.steps[0], function: "" }],
      })
    ).toThrow('"function" field is required');
  });

  it("throws on repeat < 1", () => {
    expect(() =>
      validateWorkload({
        ...validWorkload,
        steps: [{ ...validWorkload.steps[0], repeat: 0 }],
      })
    ).toThrow('"repeat" must be a positive integer');
  });

  it("throws on repeat > 10000", () => {
    expect(() =>
      validateWorkload({
        ...validWorkload,
        steps: [{ ...validWorkload.steps[0], repeat: 10_001 }],
      })
    ).toThrow("exceeds maximum of 10000");
  });

  it("returns a warning when repeat > 500", () => {
    const result = validateWorkload({
      ...validWorkload,
      steps: [{ ...validWorkload.steps[0], repeat: 501 }],
    });
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].message).toContain("501 transactions");
  });

  it("throws on negative value string", () => {
    expect(() =>
      validateWorkload({
        ...validWorkload,
        steps: [{ ...validWorkload.steps[0], value: "-1" }],
      })
    ).toThrow('"value" must be a non-negative integer string');
  });

  it("throws on non-numeric value string", () => {
    expect(() =>
      validateWorkload({
        ...validWorkload,
        steps: [{ ...validWorkload.steps[0], value: "abc" }],
      })
    ).toThrow('"value" must be a non-negative integer string');
  });
});

// ---------------------------------------------------------------------------
// isMainnet
// ---------------------------------------------------------------------------

describe("isMainnet", () => {
  it("returns true for Ethereum mainnet (1)", () => {
    expect(isMainnet(1)).toBe(true);
  });

  it("returns true for Base mainnet (8453)", () => {
    expect(isMainnet(8453)).toBe(true);
  });

  it("returns false for Base Sepolia (84532)", () => {
    expect(isMainnet(84532)).toBe(false);
  });

  it("returns false for Anvil (31337)", () => {
    expect(isMainnet(31337)).toBe(false);
  });

  it("returns false for unknown chain ID", () => {
    expect(isMainnet(99999)).toBe(false);
  });
});
