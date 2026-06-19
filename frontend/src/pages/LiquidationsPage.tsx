import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { parseAbiItem } from "viem";
import { usePublicClient } from "wagmi";

import { Keeper } from "../components/Keeper";
import { CipherValue } from "../components/viz/CipherValue";
import { MARKET_ABI } from "../lib/abis";
import { MARKETS, type MarketInfo } from "../lib/config";
import { shortAddr } from "../lib/format";
import { safeGetLogs } from "../lib/logs";

const HEALTH_RESOLVED = parseAbiItem("event HealthCheckResolved(address indexed user, bool liquidatable)");

interface FlaggedPosition {
  market: MarketInfo;
  user: `0x${string}`;
  until: number; // unix seconds
}

/**
 * Liquidations: the one place encrypted lending touches the public — and it
 * does so one bit at a time. Explainer, the live board of flagged positions
 * (public 10-minute windows), and the keeper desk to act on them.
 */
export function LiquidationsPage() {
  const publicClient = usePublicClient();
  const [desk, setDesk] = useState<{ market: MarketInfo; target: string }>({
    market: MARKETS[0],
    target: "",
  });

  const { data: flagged } = useQuery({
    queryKey: ["flagged"],
    refetchInterval: 15_000,
    enabled: !!publicClient,
    queryFn: async (): Promise<FlaggedPosition[]> => {
      const logs = await safeGetLogs(publicClient!, {
        address: MARKETS.map((m) => m.address),
        event: HEALTH_RESOLVED,
      });

      // last verdict per (market, user), keep only liquidatable=true
      const candidates = new Map<string, { market: MarketInfo; user: `0x${string}` }>();
      for (const log of [...logs].sort((a, b) => Number((a.blockNumber ?? 0n) - (b.blockNumber ?? 0n)))) {
        const market = MARKETS.find((m) => m.address.toLowerCase() === log.address.toLowerCase());
        if (!market) continue;
        const args = log.args as unknown as { user: `0x${string}`; liquidatable: boolean };
        const key = `${market.address}-${args.user}`.toLowerCase();
        if (args.liquidatable) candidates.set(key, { market, user: args.user });
        else candidates.delete(key);
      }

      const now = Math.floor(Date.now() / 1000);
      const results: FlaggedPosition[] = [];
      for (const { market, user } of candidates.values()) {
        const until = Number(
          await publicClient!.readContract({
            address: market.address,
            abi: MARKET_ABI,
            functionName: "liquidatableUntil",
            args: [user],
          }),
        );
        if (until > now) results.push({ market, user, until });
      }
      return results.sort((a, b) => a.until - b.until);
    },
  });

  return (
    <div className="max-w-5xl mx-auto px-4 pb-16 pt-6 space-y-4">
      <div>
        <h2 className="text-xl font-black">Liquidations</h2>
        <p className="text-xs text-slate-400 max-w-2xl mt-1">
          Health checks reveal a single yes/no bit per position — never the amounts.
        </p>
      </div>

      {/* the one-bit mechanism, as a product surface */}
      <div className="grid md:grid-cols-3 gap-2 text-xs">
        {[
          {
            n: "01",
            t: "Anyone requests a check",
            d: "Pick any borrower. The contract compares enc(collateral) × price × 80% against enc(debt) × index — entirely under FHE. Nobody learns the numbers, including the contract.",
          },
          {
            n: "02",
            t: "The KMS answers with ONE bit",
            d: "Zama's key network decrypts only the comparison result: liquidatable, yes or no. A cryptographic proof lands on-chain. Position sizes stay sealed.",
          },
          {
            n: "03",
            t: "A public 10-minute window opens",
            d: "A confirmed YES flags the address publicly below. Anyone can liquidate within the window — repay up to 50% of the debt, earn 5% on the seized collateral. Amounts stay encrypted even from the liquidator.",
          },
        ].map((s) => (
          <div key={s.n} className="panel p-4 relative">
            <div className="font-mono text-accent-2/40 font-black text-2xl absolute right-3 top-2">{s.n}</div>
            <div className="font-bold mb-1.5 mt-1">{s.t}</div>
            <p className="text-slate-400 leading-relaxed">{s.d}</p>
          </div>
        ))}
      </div>

      <WorkedExample />

      {/* live flag board */}
      <div className="panel p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="font-bold text-sm">Flagged positions — liquidatable now</div>
            <div className="text-[11px] text-slate-400">
              Confirmed verdicts with their 10-minute windows still open. Anyone can see this list and
              liquidate — the position sizes stay encrypted.
            </div>
          </div>
          <span className="tag bg-neg/10 text-neg border border-neg/30">{flagged?.length ?? 0} live</span>
        </div>

        {flagged && flagged.length > 0 ? (
          <div className="space-y-1.5">
            {flagged.map((f) => (
              <FlagRow key={`${f.market.address}-${f.user}`} flag={f} onLiquidate={() => setDesk({ market: f.market, target: f.user })} />
            ))}
          </div>
        ) : (
          <div className="bg-panel-2/60 rounded-xl p-5 text-center">
            <div className="text-2xl mb-1.5">🛡️</div>
            <div className="text-sm font-bold text-slate-300">No flagged positions right now</div>
            <p className="text-[11px] text-slate-500 mt-1 max-w-md mx-auto">
              Run a health check below on any borrower address. If the KMS confirms the position is
              liquidatable, it appears here for ten minutes.
            </p>
          </div>
        )}
      </div>

      {/* the desk */}
      <div id="keeper-desk">
        <Keeper
          key={`${desk.market.address}-${desk.target}`}
          market={desk.market}
          prefillTarget={desk.target}
        />
      </div>

      <div className="panel p-3 text-[11px] text-slate-500 leading-relaxed">
        <b className="text-slate-400">Why this design?</b> Any "riskiness hint" shown before a check
        would leak position information — observers could bisect your balances over time. So cLend is
        strictly binary: encrypted until a check, public flag only after a confirmed verdict, expiring in
        10 minutes. Discovery costs a keeper one transaction; the 5% bonus pays for the sweep. Once one
        keeper finds a 1, everyone can compete on execution — the same dynamics as Aave, without
        exposing positions.
      </div>
    </div>
  );
}

/** The blind-bid mechanic, with numbers — so anyone can actually liquidate. */
function WorkedExample() {
  return (
    <div className="panel p-4">
      <div className="font-bold text-sm mb-1">How a blind liquidation works — worked example</div>
      <p className="text-[11px] text-slate-400 mb-3 max-w-2xl">
        You don't need to know the borrower's numbers. You submit a{" "}
        <b className="text-slate-300">ceiling bid</b> — the most you're willing to repay — and the
        contract clamps it against the hidden debt, under encryption.
      </p>

      <div className="grid md:grid-cols-[auto_1fr] gap-4">
        {/* hidden scenario */}
        <div className="bg-panel-2 rounded-xl p-3 text-xs font-mono space-y-1 min-w-56">
          <div className="text-[10px] text-slate-500 font-sans font-bold tracking-wider mb-1.5">
            THE POSITION (hidden from you)
          </div>
          <div>
            debt <span className="text-neg font-bold">10,000 cUSDC</span>
          </div>
          <div>
            collateral <span className="text-accent-2 font-bold">5 cWETH</span> @ $1,200
          </div>
          <div>
            health factor <span className="text-neg font-bold">0.48</span> → check returns{" "}
            <span className="text-neg font-bold">1</span>
          </div>
        </div>

        {/* outcomes per bid */}
        <div className="space-y-1.5 text-xs">
          {[
            {
              bid: "You bid 6,000",
              math: "min(6,000, 50% × 10,000) = 5,000 repaid",
              result: "you seize 5,000 × 1.05 / $1,200 = 4.375 cWETH ($5,250)",
              note: "+$250 profit",
              good: true,
            },
            {
              bid: "You bid 1,000",
              math: "min(1,000, 5,000) = 1,000 repaid",
              result: "you seize 0.875 cWETH ($1,050)",
              note: "+$50 profit — small bids always work, just liquidate less",
              good: true,
            },
            {
              bid: "You bid 8,000 but only hold 3,000",
              math: "your token balance can't cover the clamped repay",
              result: "the transfer moves 0 — you repay nothing, seize nothing",
              note: "and the flag is consumed. Never bid more than you hold (the desk warns you).",
              good: false,
            },
          ].map((row) => (
            <div
              key={row.bid}
              className={`rounded-xl px-3 py-2 border ${row.good ? "bg-pos/5 border-pos/20" : "bg-neg/5 border-neg/25"}`}
            >
              <span className="font-bold text-slate-200">{row.bid}</span>
              <span className="text-slate-400"> → {row.math} → </span>
              <span className={row.good ? "text-pos" : "text-neg"}>{row.result}</span>
              <span className="text-slate-500"> · {row.note}</span>
            </div>
          ))}
          <p className="text-[11px] text-slate-500 pt-1">
            The transaction never reverts for bidding "wrong" — over-bids clamp to the 50% close
            factor, under-bids execute in full. After any liquidation the position changed, so the flag
            expires; if it's still unhealthy, the next health check re-flags it. Your repay and seizure
            amounts are visible only to you — the chain records ciphertext.
          </p>
        </div>
      </div>
    </div>
  );
}

function FlagRow({ flag, onLiquidate }: { flag: FlaggedPosition; onLiquidate: () => void }) {
  const secondsLeft = Math.max(0, flag.until - Math.floor(Date.now() / 1000));
  const mm = Math.floor(secondsLeft / 60);
  const ss = String(secondsLeft % 60).padStart(2, "0");

  return (
    <div className="flex items-center gap-3 bg-neg/5 border border-neg/25 rounded-xl px-3 py-2.5">
      <span className="w-2 h-2 rounded-full bg-neg animate-pulse shrink-0" />
      <span className="font-mono text-sm">{shortAddr(flag.user)}</span>
      <span className="text-[11px] text-slate-400">
        {flag.market.collateral.symbol} / {flag.market.debt.symbol}
      </span>
      <span className="text-[11px] font-mono text-slate-500">
        Size: <CipherValue value="" hidden chars={7} className="text-[10px]" />
      </span>
      <span className="ml-auto font-mono text-xs text-neg font-bold">
        {mm}:{ss} left
      </span>
      <a href="#keeper-desk" className="btn bg-neg text-ink text-xs font-bold" onClick={onLiquidate}>
        Liquidate
      </a>
    </div>
  );
}
