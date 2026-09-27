import { describe, it, expect } from "vitest";
import { encodeErrorResult, parseAbiItem } from "viem";
import type { Abi } from "viem";
import { extractRevertData, decodeRevertReason } from "../src/revert-decoder.js";

// Build a viem-style error whose revert data lives in the cause chain.
function errWithData(data: string, message = "reverted"): Error {
  const inner = Object.assign(new Error(message), { data });
  return Object.assign(new Error("The contract function reverted."), {
    cause: inner,
  });
}

describe("extractRevertData", () => {
  it("finds ABI-encoded data in the cause chain", () => {
    const data = encodeErrorResult({
      abi: [parseAbiItem("error Error(string reason)")] as unknown as Abi,
      errorName: "Error",
      args: ["nope"],
    });
    expect(extractRevertData(errWithData(data))).toBe(data);
  });

  it("reports an explicit empty ('0x') revert instead of dropping it", () => {
    expect(extractRevertData(errWithData("0x"))).toBe("0x");
  });

  it("returns undefined when no revert data is present anywhere", () => {
    expect(
      extractRevertData(new Error("Execution reverted for an unknown reason."))
    ).toBeUndefined();
  });
});

describe("decodeRevertReason", () => {
  it("decodes a standard Error(string) revert", async () => {
    const data = encodeErrorResult({
      abi: [parseAbiItem("error Error(string reason)")] as unknown as Abi,
      errorName: "Error",
      args: ["insufficient allowance"],
    });
    const reason = await decodeRevertReason(errWithData(data), { lookup: false });
    expect(reason).toContain("insufficient allowance");
  });

  it("decodes a custom error from the step ABI", async () => {
    const abi = [parseAbiItem("error Unauthorized(address caller)")] as unknown as Abi;
    const data = encodeErrorResult({
      abi,
      errorName: "Unauthorized",
      args: ["0x0000000000000000000000000000000000000001"],
    });
    const reason = await decodeRevertReason(errWithData(data), { abi, lookup: false });
    expect(reason).toContain("Unauthorized");
  });

  it("names likely causes for a data-less ('0x') revert", async () => {
    const reason = await decodeRevertReason(errWithData("0x"), { lookup: false });
    expect(reason).toMatch(/allowance or balance/i);
  });

  it("replaces viem's opaque 'unknown reason' with actionable guidance", async () => {
    const reason = await decodeRevertReason(
      new Error("Execution reverted for an unknown reason."),
      { lookup: false }
    );
    expect(reason).toMatch(/no revert data to decode/i);
    expect(reason).toMatch(/precondition/i);
  });

  it("keeps a real reason the node put in the error message", async () => {
    const reason = await decodeRevertReason(
      new Error("execution reverted: insufficient balance"),
      { lookup: false }
    );
    expect(reason).toContain("insufficient balance");
  });
});
