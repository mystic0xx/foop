import Anthropic from "@anthropic-ai/sdk";

/**
 * Creates an Anthropic client. Credentials resolve from the environment
 * (ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, or an `ant auth login` profile).
 */
export function createAiClient(): Anthropic {
  return new Anthropic();
}

/**
 * True if an Anthropic credential is likely available. Used only to print a
 * friendlier hint before we make the first request — the SDK still resolves
 * profiles we can't see here, so an auth error at call time is the real gate.
 */
export function hasAiCredential(): boolean {
  return Boolean(
    process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN
  );
}

/**
 * Chains foop can target, shared between the AI system prompt and the init
 * scaffold. The AI maps natural-language names ("base sepolia") to these IDs.
 */
export const CHAINS: Array<{ id: number; name: string; testnet: boolean }> = [
  { id: 84532, name: "Base Sepolia", testnet: true },
  { id: 421614, name: "Arbitrum Sepolia", testnet: true },
  { id: 11155111, name: "Sepolia", testnet: true },
  { id: 31337, name: "Anvil / Hardhat", testnet: true },
  { id: 8453, name: "Base", testnet: false },
  { id: 1, name: "Ethereum Mainnet", testnet: false },
  { id: 10, name: "Optimism", testnet: false },
  { id: 42161, name: "Arbitrum One", testnet: false },
  { id: 137, name: "Polygon", testnet: false },
];

export function chainName(id: number): string {
  return CHAINS.find((c) => c.id === id)?.name ?? `Chain ${id}`;
}
