import type { PublicClient, WalletClient, Address } from "viem";

// ---------------------------------------------------------------------------
// Nonce manager
// ---------------------------------------------------------------------------

/**
 * Fetches the starting nonce for a wallet and vends incrementing nonces
 * for sequential transaction submission.
 *
 * Uses "pending" count so in-flight transactions from the same run are
 * included in the base, preventing nonce collisions on retry.
 */
export class NonceManager {
  private current: number | null = null;

  constructor(
    private readonly client: PublicClient,
    private readonly address: Address
  ) {}

  async init(): Promise<void> {
    this.current = await this.client.getTransactionCount({
      address: this.address,
      blockTag: "pending",
    });
  }

  next(): number {
    if (this.current === null) {
      throw new Error("NonceManager not initialised — call init() first.");
    }
    return this.current++;
  }

  /** Reset to latest on-chain nonce (used after a failed tx). */
  async reset(): Promise<void> {
    this.current = await this.client.getTransactionCount({
      address: this.address,
      blockTag: "pending",
    });
  }
}
