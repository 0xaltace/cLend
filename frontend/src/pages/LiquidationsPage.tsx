import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { parseAbiItem } from "viem";
import { usePublicClient } from "wagmi";

import { IconShield } from "../components/Icons";
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
    <div className="max-w-6xl mx-auto px-4 pb-16 pt-8 space-y-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Liquidations</h2>
        <p className="text-xs text-t2 max-w-2xl mt-1">
          Health checks reveal a single yes/no bit per position — never the amounts.
        </p>
      </div>

      {/* the one-bit mechanism, as a product surface */}
      <div className="grid md:grid-cols-3 gap-3 text-xs">
        {[
          {
            n: "01",
            t: "Anyone requests a check",
            d: "The contract compares encrypted collateral vs debt entirely under FHE. Nobody learns the numbers.",
          },
          {
            n: "02",
            t: "The KMS answers with one bit",
            d: "Only the verdict is decrypted: liquidatable, yes or no, with a proof on-chain.",
          },
          {
            n: "03",
            t: "A 10-minute window opens",
            d: "A confirmed yes flags the address below. Anyone can repay up to 50% and earn a 5% bonus — amounts stay encrypted.",
          },
        ].map((s) => (
          <div key={s.n} className="panel panel-hover p-5 relative overflow-hidden">
            <div className="font-mono text-transparent bg-clip-text bg-gradient-to-b from-accent-2/50 to-transparent font-bold text-4xl absolute right-4 top-2 select-none">
              {s.n}
            </div>
            <div className="font-bold mb-1.5 mt-1 pr-12">{s.t}</div>
            <p className="text-t2 leading-relaxed">{s.d}</p>
          </div>
        ))}
      </div>

      <WorkedExample />

      {/* live flag board */}
      <div className="panel p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="font-bold text-sm">Flagged positions</div>
            <div className="text-[11px] text-t2 mt-0.5">
              Confirmed verdicts with open windows. Sizes stay encrypted.
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
          <div className="well rounded-xl p-6 text-center">
            <div className="w-10 h-10 rounded-xl well grid place-items-center mx-auto mb-2 text-pos">
              <IconShield size={18} />
            </div>
            <div className="text-sm font-bold text-t2">No flagged positions right now</div>
            <p className="text-[11px] text-t3 mt-1 max-w-md mx-auto">
              Run a health check below — a confirmed verdict appears here for ten minutes.
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

      <p className="text-[11px] text-t3 leading-relaxed px-1">
        <b className="text-t2">Why strictly binary?</b> Any riskiness hint before a check would let
        observers bisect balances over time — so positions stay encrypted until a confirmed verdict,
        and flags expire in 10 minutes.
      </p>
    </div>
  );
}

/** The blind-bid mechanic, with numbers — collapsed by default to keep the page lean. */
function WorkedExample() {
  return (
    <details className="panel p-4 group">
      <summary className="cursor-pointer list-none flex items-center justify-between text-sm font-bold select-none">
        How a blind liquidation works — worked example
        <span className="text-t3 text-xs font-normal group-open:hidden">Show</span>
        <span className="text-t3 text-xs font-normal hidden group-open:inline">Hide</span>
      </summary>
      <p className="text-[11px] text-t2 my-3 max-w-2xl">
        You bid the most you're willing to repay; the contract clamps it against the hidden debt, under
        encryption.
      </p>

      <div className="grid md:grid-cols-[auto_1fr] gap-4">
        {/* hidden scenario */}
        <div className="well rounded-xl p-3.5 text-xs font-mono space-y-1 min-w-56">
          <div className="label mb-1.5">
            The position (hidden from you)
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
              note: "+$50 — small bids always work",
              good: true,
            },
            {
              bid: "You bid 8,000 but only hold 3,000",
              math: "your balance can't cover the clamped repay",
              result: "the transfer moves 0 and the flag is consumed",
              note: "never bid more than you hold (the desk warns you)",
              good: false,
            },
          ].map((row) => (
            <div
              key={row.bid}
              className={`rounded-xl px-3 py-2 border ${row.good ? "bg-pos/5 border-pos/20" : "bg-neg/5 border-neg/25"}`}
            >
              <span className="font-bold text-t1">{row.bid}</span>
              <span className="text-t2"> → {row.math} → </span>
              <span className={row.good ? "text-pos" : "text-neg"}>{row.result}</span>
              <span className="text-t3"> · {row.note}</span>
            </div>
          ))}
          <p className="text-[11px] text-t3 pt-1">
            Bids never revert: over-bids clamp to the 50% close factor, under-bids fill in full. Your
            repay and seizure amounts are visible only to you.
          </p>
        </div>
      </div>
    </details>
  );
}

function FlagRow({ flag, onLiquidate }: { flag: FlaggedPosition; onLiquidate: () => void }) {
  const secondsLeft = Math.max(0, flag.until - Math.floor(Date.now() / 1000));
  const mm = Math.floor(secondsLeft / 60);
  const ss = String(secondsLeft % 60).padStart(2, "0");

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 bg-neg/[0.06] border border-neg/25 rounded-xl px-3.5 py-2.5">
      <span className="w-2 h-2 rounded-full bg-neg animate-pulse shrink-0 shadow-[0_0_8px_rgba(255,112,112,0.9)]" />
      <span className="font-mono text-sm">{shortAddr(flag.user)}</span>
      <span className="text-[11px] text-t2">
        {flag.market.collateral.symbol} / {flag.market.debt.symbol}
      </span>
      <span className="text-[11px] font-mono text-t3">
        Size: <CipherValue value="" hidden chars={7} className="text-[10px]" />
      </span>
      <span className="ml-auto font-mono text-xs text-neg font-bold tabular">
        {mm}:{ss} left
      </span>
      <a href="#keeper-desk" className="btn-danger text-xs" onClick={onLiquidate}>
        Liquidate
      </a>
    </div>
  );
}
