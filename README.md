# cLend — Fully Encrypted Lending

**The first fully encrypted lending platform.** Collateral, debt, supplied balances, and health
factors live on-chain as Fully Homomorphic Encryption (FHE) ciphertext. The protocol enforces
solvency and computes interest **without ever seeing your numbers** — the only value ever made public
per position is a single bit: *liquidatable, yes or no.*

Built on the [Zama Protocol](https://docs.zama.org/protocol) (FHEVM v0.11) for the **Zama Developer
Program Mainnet Season 3 — Builder Track**.

- **Live app:** _(Vercel URL — added at deployment)_
- **Network:** Ethereum Sepolia testnet
- **Assets:** 7 markets on official Zama Confidential Wrappers Registry tokens

---

## What it is

cLend is a confidential money market. It takes the **isolated-market architecture of Morpho Blue**
(one collateral asset + one borrow asset per market, no shared-pool contagion) and the **mechanics of
Aave** (kinked utilization interest rates, interest-bearing supply shares, close factor, liquidation
bonus), and runs all user balances as encrypted `euint64` values via Zama's FHEVM.

| | Aave | Morpho | cLend |
|---|---|---|---|
| Balances | Public | Public | **Encrypted** |
| Collateral & debt | Public | Public | **Encrypted** |
| Health factor | Public | Public | **Encrypted — 1-bit verdict on demand** |
| Liquidation price | Computable by anyone | Computable by anyone | **Computable only by you** |
| Asset listing | Governance vote | Permissionless | **Permissionless, registry-gated** |
| Risk isolation | Shared pool | Isolated markets | **Isolated markets** |

### Why encryption matters

On Aave or Morpho, every wallet's collateral, debt, and exact liquidation price are public forever.
Liquidation bots maintain sorted lists of positions and snipe them the block they cross a health
factor of 1.0; position sizes broadcast strategy and link wallets to identities; and no institution
can run a book where every counterparty sees its margin in real time. cLend removes all of that: the
public chain sees only ciphertext.

---

## How it works

FHE lets the contract do arithmetic on numbers it cannot read. Three moments matter:

1. **Encrypt in the browser.** Amounts are encrypted client-side with a zero-knowledge proof of
   well-formedness. The transaction carries only ciphertext — the mempool, the chain, and MEV bots
   learn nothing from it.
2. **FHE math on-chain.** Borrow limits, interest, and solvency are computed directly on the encrypted
   values. Requests above your limit are clamped *inside the ciphertext* (`FHE.select`), so even a
   failed attempt reveals no information. **The contract never reverts based on encrypted state** — a
   revert is publicly visible and would leak position information.
3. **One public bit.** Liquidation needs a public verdict, so a keeper asks Zama's KMS to decrypt
   exactly one boolean: liquidatable or not. Position sizes stay encrypted, including from the
   liquidator who profits.

### Markets (Sepolia)

Live Chainlink-fed markets, then posted-feed (◆) markets:

| Market | Collateral | Borrow | Price feed |
|---|---|---|---|
| cWETH / cUSDC | cWETH | cUSDC | Chainlink ETH/USD |
| cUSDC / cWETH | cUSDC | cWETH | Chainlink |
| ctGBP / cUSDC | ctGBP | cUSDC | Chainlink GBP/USD |
| cXAUt / cUSDC | cXAUt | cUSDC | Chainlink XAU/USD |
| cZAMA / cUSDC ◆ | cZAMA | cUSDC | Posted (testnet mock) |
| cUSDT / cUSDC ◆ | cUSDT | cUSDC | Posted (testnet mock) |
| cBRON / cUSDC ◆ | cBRON | cUSDC | Posted (testnet mock) |

All seven assets are official ERC-7984 wrappers from the Zama Confidential Wrappers Registry. The
factory re-checks `isConfidentialTokenValid` on-chain at market creation, so a revoked wrapper can
never enter a market. Mock-only assets (cZAMA, cUSDT, cBRON) have no Chainlink feed on Sepolia and use
an owner-posted feed, disclosed with a ◆ badge everywhere they appear.

---

## Interest & fees

cLend uses the same index-based, auto-compounding model as Aave and Compound. There is **no claim
step** and **no reward token** — your supplied balance simply grows.

### The rate model

```
borrow APR = kinked utilization curve
             0% base · +4% APR up to the 80% utilization kink · +60% APR from kink to 100%

supply APR = borrow APR × utilization × (1 − reserve factor)

protocol fee = reserve factor (10%) of borrow interest
```

- **Borrowers pay** the borrow APR. **Suppliers earn** the supply APR, which is always lower — the gap
  is the protocol fee. This is one flow (borrowers → suppliers, minus a protocol slice), identical in
  shape to Aave/Compound.
- `× utilization`: suppliers earn only on the borrowed fraction of the pool; idle cash earns nothing.
- `× (1 − reserve factor)`: the 10% the protocol retains as a reserve buffer against bad debt.
- **Collateral earns nothing** — it is locked as backing and never lent out (no rehypothecation), so
  it is always available for withdrawal and liquidation.

### How the contract tracks it (no per-user interest writes)

Two **public** indexes, accrued in plaintext at zero FHE cost:

```
borrowIndex6, supplyIndex6   // start at 1_000_000 (= 1.0, 6-dec fixed point)
accrue():  index *= (1 + APR × elapsed / year)
```

Each user stores one *fixed*, encrypted normalized amount; their live value re-derives from the index:

- **Supplier** holds encrypted `shares`; on supply `shares = received × 1e6 / supplyIndex`. Real
  balance = `shares × supplyIndex / 1e6`. As the index ticks up, the balance grows with **no per-user
  write** — that is the auto-compound.
- **Borrower** holds encrypted `debtNorm`; on borrow `debtNorm += borrowed × 1e6 / borrowIndex`. Real
  debt = `debtNorm × borrowIndex / 1e6`, growing automatically as the index climbs.

The contract never loops over users to apply interest (impossible at scale, and on encrypted data).
The **fee** is implicit in the spread: `supplyIndex` grows slower than `borrowIndex` by the reserve
factor, so the pool collects more from borrowers than it pays suppliers, and the difference accumulates
as pool surplus (the reserves).

Rates themselves refresh at each **rate sync**, when utilization is disclosed (see below). Between
syncs the indexes keep accruing at the last-set rate. (v1 simplification: reserves accumulate in the
pool but there is no treasury-withdrawal function yet — see [SECURITY.md](./SECURITY.md).)

---

## Liquidations — the one-bit mechanism

Because positions are encrypted, no bot can read health factors off-chain. Instead, **anyone can be a
keeper**:

1. **Request a health check** on any borrower (permissionless, 60s cooldown). The contract compares
   `collateral × price × liquidationThreshold` against `debt × index` entirely under FHE.
2. **The KMS decrypts one bit** — liquidatable or not — and a proof lands on-chain.
3. **A confirmed `true` opens a public 10-minute window** (bound to the position's nonce). Anyone can
   liquidate within it: repay up to 50% of the debt (close factor), seize collateral worth the repaid
   amount × 1.05 (5% bonus). The liquidator submits an encrypted ceiling bid that the contract clamps
   to the real debt — they never need to know the position size, and amounts stay encrypted even from
   them.

The **Liquidations** page in the app explains this with a worked example and a live board of currently
flagged positions.

### Rate sync (the only other disclosure)

Utilization is needed for the rate curve and TVL. A permissionless `requestRateSync` (≥5 min apart)
discloses three pool aggregates — cash, total borrows, collateral balance — via the KMS, and
`submitRateSync` stores them publicly and recomputes the APRs. **Pool aggregates are public by design;
individual positions never are.**

---

## Architecture

```
Zama Wrappers Registry  ──►  ClendFactory  ──►  ClendMarket ×7  ──►  Chainlink / posted feeds
(official ERC-20↔ERC-7984)   (permissionless,    (isolated FHE        (prices, staleness-checked)
                              registry+feed        lending pairs,
                              gated)               ERC-7984 share token)
```

**Contracts** (`contracts/`):
- `ClendFactory.sol` — permissionless market creation, gated to registry-valid + feed-priced tokens. Immutable, ownerless.
- `ClendMarket.sol` — the core. Encrypted positions, normalized-debt interest, kinked rates, one-bit
  liquidations, sync-based caps. Is itself the ERC-7984 supply-share token.
- `ClendPriceOracle.sol` — Chainlink-feed adapter with per-asset staleness TTLs.
- `PostedPriceFeed.sol` — Chainlink-interface posted feed for testnet mocks without a Chainlink feed.

**Frontend** (`frontend/`): React + Vite + wagmi/viem + `@zama-fhe/relayer-sdk` + Tailwind. Pages:
Landing, Markets, Portfolio, Liquidations, Faucet. Client-side encryption with ZK proofs, EIP-712
user-decryption sessions (cached 24h), a "privacy lens" that renders the whole app as the public sees
it (ciphertext), live risk meters, TVL, and a faucet with wrap/unwrap.

### Deployed addresses (Sepolia)

| Contract | Address |
|---|---|
| ClendFactory | `0x637b659871F914f1c8E6Ab59F9A1c36299Bb4Fb1` |
| ClendPriceOracle | `0x457ACAA3d8689652a7489a2a53B94c0aAD52e44c` |
| Wrappers Registry (Zama) | `0x2f0750Bbb0A246059d80e94c454586a7F27a128e` |
| cWETH/cUSDC market | `0x00c8f6f2e8C76FDe97a38D23Cd704D8C8D869E0B` |
| cUSDC/cWETH market | `0xfa72F36df15398A756074fA8DF7E1c3C5A5C7EBB` |
| ctGBP/cUSDC market | `0x76d985d0754B2bFE0c9296f41c93A658C9E3f259` |
| cXAUt/cUSDC market | `0x9997C4458deE86708d90D4Fc409586C2b83F98E1` |
| cZAMA/cUSDC market | `0x0A0ec13f887cdA3067223Cae614B3b29aDDCb467` |
| cUSDT/cUSDC market | `0x96f1fBd00630656D45c5E677e9de6c43749C8149` |
| cBRON/cUSDC market | `0xc01b1CF0f2F4dC36C5FF7ec2C1fa1aC18795a159` |

All contracts are verified on Sepolia Etherscan.

---

## Run it locally

Requirements: Node ≥ 22, a Sepolia RPC URL, a funded Sepolia private key.

```bash
# contracts
npm install
cp .env.example .env            # set PRIVATE_KEY, SEPOLIA_RPC_URL, ETHERSCAN_API_KEY
npm run compile
npm test                        # 23 tests, FHE mock mode

# deploy (optional — addresses above are already live)
npx hardhat deploy --network sepolia
npx hardhat run scripts/verify-all.cjs --network sepolia

# seed liquidity + initial rate syncs across all markets
npx hardhat --network sepolia clend:seed

# keeper loop (rate syncs + health-check sweeps)
npx hardhat --network sepolia clend:keeper --interval 300

# frontend
cd frontend
npm install
npm run dev                     # http://localhost:5173
```

The frontend reads contract addresses from `frontend/src/lib/config.ts`.

---

## Adding a new market

Markets are created permissionlessly through the factory, gated to safe assets:

```solidity
factory.createMarket(collateralToken, debtToken);
```

It succeeds only if **both** tokens are currently valid in the on-chain Zama Wrappers Registry **and**
both have a price feed configured in `ClendPriceOracle`. To list a new asset:

1. Ensure its ERC-7984 wrapper is registered and valid in the Wrappers Registry.
2. Configure a feed: `oracle.setFeed(cToken, chainlinkOrPostedFeed, staleTtl)` (oracle owner).
3. Call `factory.createMarket(collateral, debt)` — anyone can.
4. Add the market address to `frontend/src/lib/config.ts`.

No code changes to the market contract, no governance vote.

---

## Security & trust model

See [SECURITY.md](./SECURITY.md) for the full threat model: what is public vs. private, what an
observer with full chain + KMS-result access can and cannot learn, the revert-vs-clamp rule, known
limitations (liquidation-flag griefing, bad-debt accounting, sync-cap overshoot, small-pool
anonymity, decryption-session caching), and the mainnet hardening roadmap.

## Tech stack

Solidity 0.8.28 (viaIR) · `@fhevm/solidity` 0.11.1 · `@openzeppelin/confidential-contracts` 0.4.1 ·
Hardhat + `@fhevm/hardhat-plugin` · React 19 + Vite + TypeScript · wagmi/viem ·
`@zama-fhe/relayer-sdk` · Tailwind CSS · framer-motion.

## License

BSD-3-Clause-Clear.
