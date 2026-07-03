# cLend frontend

React dApp for cLend — see the [root README](../README.md) for what the protocol is and how it works.

**Stack:** React 19 · Vite · TypeScript · wagmi/viem · `@zama-fhe/relayer-sdk` (client-side FHE) · Tailwind CSS ·
framer-motion.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production bundle in dist/
npm run lint
```

Optional env vars (`.env.local`):

- `VITE_SEPOLIA_RPC_URL` — dedicated Sepolia RPC, tried before the public fallback pool.
- `VITE_WALLETCONNECT_PROJECT_ID` — enables the WalletConnect option in the connect modal; safe to omit.

Contract addresses live in [`src/lib/config.ts`](src/lib/config.ts).

## Source layout

```
src/pages/        Landing, Markets (AppPage), Portfolio, Liquidations, Faucet
src/components/   feature components; viz/ holds the gauges, meters, and cipher effects
src/context/      DecryptionContext (decrypted balances + refresh), ThemeContext (light/dark)
src/hooks/        useEncryptedWrite (encrypt → submit → wait for post-tx state), useRateSync
src/lib/          wagmi config, ABIs, fhevm session cache, market snapshots, position math
```

## How the FHE pieces fit

- **Encrypt on submit** — [`useEncryptedWrite`](src/hooks/useEncryptedWrite.ts) encrypts the amount locally with a ZK
  input proof, submits ciphertext, waits for the receipt, then polls until the RPC reflects the new balance handle
  (public fallback RPCs can lag a block).
- **Decrypt on demand** — [`DecryptionContext`](src/context/DecryptionContext.tsx) batch-decrypts wallet balances and
  positions through the relayer using a cached EIP-712 session ([`lib/fhevm.ts`](src/lib/fhevm.ts)): one wallet
  signature covers 24 hours of silent refreshes. `refreshAfterTx` retries after transactions while the relayer catches
  up to the new block.
- **Privacy lens** — the eye toggle re-renders every private value as the ciphertext the public chain actually sees.

## Cross-origin isolation (WASM)

The relayer SDK's WASM uses `SharedArrayBuffer`, which requires COOP/COEP headers. `vite.config.ts` sets them for
`dev` and `preview`; for production deploys the host must serve them too — after deploying, always verify one
encrypt/decrypt on the live URL:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```
