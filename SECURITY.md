# cLend — Security & Threat Model

cLend is testnet software built for the Zama Developer Program. This document states precisely what is
private, what is public, what an attacker can and cannot learn, the design rules that keep encrypted
positions confidential, and the known limitations and their mainnet remediations.

---

## 1. What is private vs. public

| Data | Visibility |
|---|---|
| Your collateral amount | **Encrypted** (`euint64`) — only you can decrypt |
| Your debt amount | **Encrypted** |
| Your supplied balance / shares | **Encrypted** |
| Your health factor | **Encrypted** — computed under FHE, never stored in clear |
| Your liquidation price | Not stored; derivable **only by you** after local decryption |
| One-bit liquidation verdict (on a health check) | **Public** — exactly one boolean per check |
| Pool aggregates: cash, total borrows, collateral (at a rate sync) | **Public** — needed for rates & TVL |
| Interest indexes, APRs, utilization | **Public** (plaintext) |
| Borrower / supplier addresses (from events) | **Public** — events carry addresses, never amounts |
| Market parameters (LTV, threshold, bonus, caps) | **Public** (immutable constants) |

**Individual positions are never disclosed.** Only per-position liquidation verdicts (one bit, on
demand) and pool-wide aggregates (at rate syncs) ever become public.

---

## 2. What an observer can and cannot learn

**An observer with full chain access + every KMS-decrypted result can learn:**
- Who has interacted with which market (addresses are in events).
- Each market's pool aggregates as of its last rate sync (cash, borrows, collateral) — and therefore
  TVL and utilization.
- Whether a specific position was liquidatable at the moment a health check was run on it (one bit).
- Public market parameters and interest indexes.

**They cannot learn:**
- Any individual's collateral, debt, supplied balance, or health factor.
- Any individual's liquidation price.
- Transaction amounts — every supply/borrow/repay/withdraw/liquidate amount is ciphertext on-chain.

**The single intentional disclosure to a counterparty:** a liquidator who liquidates a position learns
their *own* settlement amounts (what they repaid, what they seized), because anyone can decrypt their
own wallet. From a clamped bid they can infer a bound on the victim's debt (≤ 50% of it, since the
close factor caps each liquidation). This is bounded, happens only *after* a position has already
become unhealthy, and is visible only to that one liquidator — the public chain still sees ciphertext.
Every trade in history reveals the trade to its counterparty; this is that, and no more.

---

## 3. Core design rule: revert on public conditions, clamp on private ones

A transaction's success or failure is publicly visible. **Reverting based on an encrypted comparison
would leak position information** (an observer could probe whether your borrow exceeded X% of your
hidden collateral). Therefore:

- **Revert** only on public conditions: stale oracle, invalid KMS/input proof, invalid market,
  cooldown not elapsed, sync-based caps, sync staleness.
- **Clamp** (via `FHE.select`) on every private condition: over-borrow, over-withdraw, over-repay,
  liquidation sizing. The amount is reduced to the safe maximum inside the ciphertext; the transaction
  succeeds regardless, revealing nothing.

The frontend complements this with **pre-flight hard gates**: because your browser holds your decrypted
position, the UI blocks (and never opens a wallet prompt for) a borrow that exceeds your power or the
pool's liquidity. A user bypassing the UI and calling the contract directly still cannot exceed limits
— the on-chain clamp is the security boundary; the UI gate is the convenience boundary.

Note: zero-amount inputs cannot be rejected, since the amount is encrypted; they are harmless,
expensive no-ops.

---

## 4. Trust assumptions

1. **Zama infrastructure** — FHEVM coprocessor, threshold KMS, and relayer behave correctly. Standard
   for any FHEVM application.
2. **Chainlink feeds** (cWETH, cUSDC, ctGBP, cXAUt markets) provide honest prices; staleness is checked
   with a per-asset TTL.
3. **Posted feeds** (cZAMA, cUSDT, cBRON — testnet mocks with no Chainlink feed) are owner-controlled.
   The feed owner can move those three markets' prices. This is disclosed with a ◆ badge in the app and
   in the README. These are mock tokens with no real market, so no "true price" exists to defer to.
4. **Registry owner (Zama)** can revoke wrappers. The factory re-checks validity at market creation; an
   already-created market continues running on a later-revoked token (accepted on testnet; documented).
5. **Oracle owner** can configure feeds. It can only point an asset at a feed, not fabricate Chainlink
   prices.

---

## 5. Known limitations (and mainnet remediations)

### 5.1 Liquidation-flag griefing
After a confirmed health check, liquidation is gated by a public flag bound to the position's `nonce`.
Any position change bumps the nonce and invalidates the flag. Two consequences:
- A **borrower** can invalidate their own flag with a 1-wei `addCollateral`, forcing a re-check.
- A **liquidator with insufficient balance** calling `liquidate` moves 0 (ERC-7984 all-or-nothing) but
  still clears the flag and bumps the nonce.

Either way the position's assets and debt are untouched and no value is stolen; the cost is a wasted
keeper round-trip and the need to re-check. It cannot prevent liquidation indefinitely (each grief
costs the griefer a transaction). **Mainnet fix:** re-verify health *inside* `liquidate` under FHE and
clamp the seizure to zero if the position is actually healthy — making flags both burn-proof and
self-curing. (Tested: an underfunded liquidation leaves debt/collateral/totals unchanged.)

### 5.2 Bad debt
If a price crash leaves debt greater than the value of the remaining collateral, the residual stays on
the borrower's encrypted position and continues to accrue interest, slightly inflating that market's
utilization and supply APR until written off. The 10% reserve spread buffers suppliers first; any
shortfall is last-to-withdraw risk **within that isolated market only** (no cross-market contagion).
**Mainnet fix:** an explicit bad-debt write-off (requires a disclosure step) and a treasury that can
deploy reserves. (Tested: bad debt persists and accrues; the system stays consistent through accrual
and rate sync.)

### 5.3 Sync-based caps are soft caps
Per-market supply/borrow caps are enforced against the **last disclosed** totals, so they lag up to one
rate-sync interval and can be overshot within a stale window by transactions in the same window. They
are exposure-warning gates, not hard invariants. **Mainnet:** strict caps require either encrypted cap
math or an amount-disclosure trade-off. A 24-hour max-sync-age gate additionally pauses *new*
supply/borrow if a market's aggregates go stale (rate sync is permissionless, so anyone can refresh;
exits — withdraw/repay/liquidate — never depend on it).

### 5.4 Small-pool anonymity
With few participants in a market, the disclosed pool aggregates approximate an individual position.
The app shows a "Few known participants" badge when a market has fewer than ~5 known participants.
Individual positions remain encrypted regardless; this is an inference risk on the *aggregates*, which
are public by design. Participant counts come from events and reflect historical, not necessarily
active, users.

### 5.5 Decryption-session caching
The EIP-712 user-decryption flow caches an ephemeral keypair + wallet signature in `localStorage` for
24 hours, so balance refreshes don't re-prompt. This cached session authorizes **reading** the
connected wallet's own encrypted balances for the covered contracts — it cannot sign transactions,
move funds, decrypt anyone else's data (the KMS enforces on-chain ACLs), or outlive its 24-hour window.
Theft of the `localStorage` blob (e.g. via XSS) would let an attacker read that user's balances until
expiry — a confidentiality breach scoped to read-only, time-bounded access, not key theft. This is the
standard relayer-SDK session pattern. **Hardening at deploy:** strict Content-Security-Policy headers
and no third-party scripts to minimize the XSS vector.

### 5.6 No pause / upgrade / admin
The factory and markets are immutable and ownerless — there is no admin key to compromise, and no
upgrade path to rug. The trade-off is no incident response. **Mainnet roadmap:** a narrow guardian
behind a multisig + timelock that can pause *new* borrows/supplies but can **never** block withdraw,
repay, or liquidation.

---

## 6. FHE correctness measures

- **ACL completeness:** every stored ciphertext handle is re-granted (`FHE.allowThis` + `FHE.allow`)
  after each mutation; transient grants (`FHE.allowTransient`) precede every token transfer.
- **Scalar-only hot paths:** interest and solvency math multiply ciphertext by *plaintext* scalars
  (price, index); no ciphertext×ciphertext products on hot paths. Intermediates use `euint128`; a
  bounds analysis against the configured caps and a maximum plausible feed price keeps all intermediate
  products below 2^128.
- **HCU budget:** the heaviest path (borrow, now with an extra pool-cash clamp) stays well under the
  20M-per-tx and 5M-sequential-depth homomorphic-compute-unit limits; the borrow path deliberately
  computes debt from the clamped `amount` rather than the transfer return value to stay off the
  transfer's FHE dependency chain.
- **Unit invariant:** the market constructor reverts unless both tokens report 6 decimals, so all
  position math runs in a single fixed-point scale (tested with an 18-decimal mock that is rejected).
- **Linting:** the codebase passes the FHEVM anti-pattern linter (zero issues) and solhint.

The test suite (23 tests) covers the full lifecycle plus: pool-exhausted partial-fill borrow,
underfunded-liquidation no-op, sync-cap overshoot, sync-age gating, bad-debt persistence through
accrual, decimals invariant, and `euint64`-scale bounds.

---

## 7. Reporting

This is a testnet research project. For issues, open a GitHub issue on the repository.
