import { motion } from "framer-motion";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useReadContracts } from "wagmi";

import { ActivityFeed } from "../components/ActivityFeed";
import { LowAnonymityBadge, MarketTvl, SyncBadge, TvlBanner } from "../components/MarketWidgets";
import { MarketActions } from "../components/MarketActions";
import { MyPosition, type Preview } from "../components/MyPosition";
import { CipherValue } from "../components/viz/CipherValue";
import { RateCurve } from "../components/viz/RateCurve";
import { UtilizationArc } from "../components/viz/UtilizationArc";
import { useDecryption } from "../context/DecryptionContext";
import { MARKET_ABI, ORACLE_ABI } from "../lib/abis";
import { ADDRESSES, MARKETS, type MarketInfo } from "../lib/config";
import { aprPct, fmt6, priceUsd } from "../lib/format";
import { utilizationFromApr6 } from "../lib/positionMath";
import { tvlOf, usd, useAllSnapshots, type MarketSnapshot } from "../lib/snapshot";

/**
 * All markets start collapsed. Click to expand any of them — several can be
 * open at once; each card has its own collapse control.
 */
export function AppPage() {
  const [openSet, setOpenSet] = useState<Set<number>>(new Set());

  function toggleMarket(i: number) {
    setOpenSet((prev) => {
      const next = new Set(prev);
      if (next.has(i)) {
        next.delete(i);
      } else {
        next.add(i);
        // After the layout settles, bring the newly expanded market into view.
        setTimeout(() => {
          document.getElementById(`market-${i}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 80);
      }
      return next;
    });
  }

  const { snapshots } = useAllSnapshots();

  return (
    <div className="max-w-5xl mx-auto px-4 pb-16 pt-6 space-y-3">
      <TvlBanner />
      {MARKETS.map((market, i) => (
        <div key={market.address} id={`market-${i}`} className="scroll-mt-20">
          {openSet.has(i) ? (
            <FeaturedMarket market={market} snap={snapshots.get(market.address)} onCollapse={() => toggleMarket(i)} />
          ) : (
            <CollapsedMarketRow market={market} snap={snapshots.get(market.address)} onOpen={() => toggleMarket(i)} />
          )}
        </div>
      ))}

      <div className="grid lg:grid-cols-2 gap-3">
        <ActivityFeed />
        <div className="space-y-3">
          <div className="panel p-3 text-xs text-slate-400 leading-relaxed">
            <span className="font-bold text-slate-300">7 markets, 7 registry assets: </span>
            Every confidential token here is an official Zama registry wrapper, re-validated on-chain at
            market creation. ctGBP and cXAUt price off live Chainlink GBP/USD and XAU/USD feeds; the
            mock-only assets (cZAMA, cUSDT, cBRON) use posted feeds, labeled ◆ wherever they appear.
          </div>
          <Link to="/liquidations" className="panel p-4 block hover:border-slate-500 transition-colors">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-bold text-slate-200">⚖️ Liquidations & keeper desk</div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Run one-bit health checks, watch the live board of flagged positions, liquidate, sync
                  rates — solvency enforcement without surveillance.
                </p>
              </div>
              <span className="text-slate-500 text-lg">→</span>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}

function useMarketReads(market: MarketInfo) {
  const { data } = useReadContracts({
    contracts: [
      { address: market.address, abi: MARKET_ABI, functionName: "borrowApr6" },
      { address: market.address, abi: MARKET_ABI, functionName: "supplyApr6" },
      { address: ADDRESSES.oracle as `0x${string}`, abi: ORACLE_ABI, functionName: "priceUsd8", args: [market.collateral.cToken] },
      { address: ADDRESSES.oracle as `0x${string}`, abi: ORACLE_ABI, functionName: "priceUsd8", args: [market.debt.cToken] },
    ],
    query: { refetchInterval: 30_000 },
  });
  const [borrowApr, supplyApr, collatPrice, debtPrice] = data ?? [];
  return {
    borrowApr6: borrowApr?.result !== undefined ? BigInt(borrowApr.result) : null,
    supplyApr6: supplyApr?.result !== undefined ? BigInt(supplyApr.result) : null,
    collatPrice8: (collatPrice?.result as bigint | undefined) ?? null,
    debtPrice8: (debtPrice?.result as bigint | undefined) ?? null,
  };
}

function FeaturedMarket({ market, snap, onCollapse }: { market: MarketInfo; snap: MarketSnapshot | undefined; onCollapse: () => void }) {
  const { decryptAll, decrypted } = useDecryption();
  const [preview, setPreview] = useState<Preview | null>(null);
  const reads = useMarketReads(market);
  const u6 = reads.borrowApr6 !== null ? utilizationFromApr6(reads.borrowApr6) : 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      className="panel p-5 border-accent/50 shadow-[0_0_40px_rgba(251,210,77,0.06)] space-y-4"
    >
      {/* header strip */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex -space-x-2">
            <span className="w-10 h-10 rounded-full bg-panel-2 border border-line grid place-items-center font-black text-accent-2 text-lg z-10">
              {market.collateral.logo}
            </span>
            <span className="w-10 h-10 rounded-full bg-panel-2 border border-line grid place-items-center font-black text-accent text-lg">
              {market.debt.logo}
            </span>
          </div>
          <div>
            <div className="font-black text-xl leading-tight flex items-center gap-2">
              {market.collateral.symbol} <span className="text-slate-500 font-medium">/</span> {market.debt.symbol}
              <LowAnonymityBadge market={market} />
            </div>
            <div className="text-[11px] text-slate-400">
              Deposit {market.collateral.symbol} · Borrow {market.debt.symbol}
              <span className="text-pos ml-2">Registry ✓</span>
              {market.collateral.postedFeed && <span className="text-amber-400 ml-2">◆ Posted feed</span>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-5">
          <HeaderStat label="Supply APR" value={reads.supplyApr6 !== null ? aprPct(reads.supplyApr6) : "—"} color="text-pos" />
          <HeaderStat label="Borrow APR" value={reads.borrowApr6 !== null ? aprPct(reads.borrowApr6) : "—"} color="text-accent" />
          <HeaderStat
            label={`${market.collateral.symbol} price`}
            value={reads.collatPrice8 !== null ? priceUsd(reads.collatPrice8) : "—"}
            color="text-slate-200"
          />
          <UtilizationArc utilization6={u6} size={62} />
          <button
            onClick={onCollapse}
            className="btn-ghost text-base px-3 py-1"
            title="Collapse this market"
          >
            −
          </button>
        </div>
      </div>

      {/* TVL + sync freshness for this market */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-panel-2/40 rounded-xl px-3 py-2">
        <MarketTvl snap={snap} />
        <SyncBadge market={market} snap={snap} />
      </div>

      <MyPosition market={market} preview={preview} />

      <div className="grid lg:grid-cols-[1fr_auto] gap-4 items-start">
        <div className="panel p-4 border-accent/20">
          <div className="text-[10px] font-bold tracking-widest text-slate-500 mb-2">
            BORROW — Manage collateral & loan
          </div>
          <MarketActions market={market} group="borrow" onDone={() => decrypted && decryptAll()} onPreview={setPreview} />
        </div>
        <div className="panel bg-panel-2/40 p-4 hidden lg:block">
          <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-2">Interest rate model</div>
          <RateCurve utilization6={u6} />
        </div>
      </div>

      <EarnPanel market={market} onDone={() => decrypted && decryptAll()} onPreview={setPreview} />
    </motion.div>
  );
}

/** The lender side as its own clearly separated surface: what you've supplied,
 *  what it earns, and the supply/withdraw actions — distinct from your loan. */
function EarnPanel({ market, onDone, onPreview }: {
  market: MarketInfo;
  onDone: () => void;
  onPreview: (p: Preview | null) => void;
}) {
  const { decrypted, publicView, positions } = useDecryption();
  const reads = useMarketReads(market);
  const position = positions.find((p) => p.market.address === market.address);
  const hidden = !decrypted || publicView;

  return (
    <div className="panel p-4 border-pos/25 bg-pos/[0.02]">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <div className="text-[10px] font-bold tracking-widest text-pos/80 mb-0.5">
            EARN — Lend {market.debt.symbol} to this pool
          </div>
          <p className="text-[11px] text-slate-400 max-w-xl leading-snug">
            Completely separate from any loan: you supply {market.debt.symbol} into the pool that
            borrowers draw from, and earn the supply APR. Withdraw any time the pool has cash. You can
            be a lender, a borrower, or both.
          </p>
        </div>
        <div className="bg-panel-2 rounded-xl p-3 min-w-52">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">
            Supplied ({market.debt.symbol})
          </div>
          <div className="font-mono font-bold text-lg text-pos">
            <CipherValue value={position ? fmt6(position.supplied, 2) : "0"} hidden={hidden} chars={8} />
          </div>
          <div className="text-[11px] text-slate-400 font-mono">
            Earning {reads.supplyApr6 !== null ? aprPct(reads.supplyApr6) : "—"} APR
          </div>
        </div>
      </div>
      <MarketActions market={market} group="earn" onDone={onDone} onPreview={onPreview} />
    </div>
  );
}

function CollapsedMarketRow({ market, snap, onOpen }: { market: MarketInfo; snap: MarketSnapshot | undefined; onOpen: () => void }) {
  const reads = useMarketReads(market);
  const u6 = reads.borrowApr6 !== null ? utilizationFromApr6(reads.borrowApr6) : 0;
  const tvl = snap ? tvlOf(snap) : null;

  return (
    <motion.button
      layout
      onClick={onOpen}
      className="panel w-full p-3.5 flex items-center justify-between gap-4 hover:border-slate-500 transition-colors"
    >
      <div className="flex items-center gap-3">
        <div className="flex -space-x-1.5">
          <span className="w-7 h-7 rounded-full bg-panel-2 border border-line grid place-items-center font-bold text-accent-2 text-xs z-10">
            {market.collateral.logo}
          </span>
          <span className="w-7 h-7 rounded-full bg-panel-2 border border-line grid place-items-center font-bold text-accent text-xs">
            {market.debt.logo}
          </span>
        </div>
        <span className="font-bold text-sm">
          {market.collateral.symbol} <span className="text-slate-500 font-normal">/</span> {market.debt.symbol}
        </span>
        {market.collateral.postedFeed && <span className="text-amber-400 text-[10px]">◆</span>}
      </div>
      <div className="flex items-center gap-5 text-xs font-mono">
        {tvl && <span className="text-slate-400 hidden sm:inline">TVL <span className="text-slate-200">{usd(tvl.totalUsd)}</span></span>}
        <span className="text-pos">▲ {reads.supplyApr6 !== null ? aprPct(reads.supplyApr6) : "—"}</span>
        <span className="text-accent">▼ {reads.borrowApr6 !== null ? aprPct(reads.borrowApr6) : "—"}</span>
        <UtilizationArc utilization6={u6} size={36} />
        <span className="text-slate-500 text-base">＋</span>
      </div>
    </motion.button>
  );
}

function HeaderStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="text-right">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`font-mono font-bold ${color}`}>{value}</div>
    </div>
  );
}
