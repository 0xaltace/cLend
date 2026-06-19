import { fallback, http } from "viem";
import { createConfig } from "wagmi";
import { sepolia } from "wagmi/chains";
import { injected } from "wagmi/connectors";

// Public Sepolia RPCs with automatic failover. Event-driven features use
// `safeGetLogs`, which chunks queries when a provider caps eth_getLogs ranges,
// so the app works on public endpoints without a private key in the bundle.
// An optional VITE_SEPOLIA_RPC_URL override is tried first when present (e.g. a
// domain-locked dedicated key in production).
const override = import.meta.env.VITE_SEPOLIA_RPC_URL as string | undefined;

// Several independent public endpoints. viem's fallback rotates to the next on
// error/timeout; `rank` periodically reorders them by latency + stability so the
// healthiest one is preferred during the live demo.
const transports = [
  http("https://ethereum-sepolia-rpc.publicnode.com"),
  http("https://sepolia.gateway.tenderly.co"),
  http("https://1rpc.io/sepolia"),
  http("https://rpc.sepolia.org"),
];

export const wagmiConfig = createConfig({
  chains: [sepolia],
  connectors: [injected()],
  transports: {
    [sepolia.id]: fallback(override ? [http(override), ...transports] : transports, {
      rank: { interval: 60_000, sampleCount: 3 },
      retryCount: 2,
    }),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
