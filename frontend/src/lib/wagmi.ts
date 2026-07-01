import { fallback, http } from "viem";
import { createConfig } from "wagmi";
import { sepolia } from "wagmi/chains";
import { coinbaseWallet, injected, walletConnect } from "wagmi/connectors";

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

// Injected (MetaMask/Rabby/…) + Coinbase are always available. WalletConnect is
// added only when a project id is present, so a missing key can never break the
// app — the connect modal simply won't show the WalletConnect option.
const wcProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined;

const connectors = [
  injected(),
  coinbaseWallet({ appName: "cLend" }),
  ...(wcProjectId
    ? [
        walletConnect({
          projectId: wcProjectId,
          showQrModal: true,
          metadata: {
            name: "cLend",
            description: "Fully encrypted lending on Zama FHEVM",
            url: "https://c-lend.vercel.app",
            icons: ["https://c-lend.vercel.app/logo.svg"],
          },
        }),
      ]
    : []),
];

export const wagmiConfig = createConfig({
  chains: [sepolia],
  connectors,
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
