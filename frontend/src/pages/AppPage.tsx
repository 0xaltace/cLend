import { motion } from "framer-motion";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useReadContracts } from "wagmi";

import { ActivityFeed } from "../components/ActivityFeed";
import { IconArrowRight, IconMinus, IconPlus, IconScale } from "../components/Icons";
import { LowAnonymityBadge, MarketTvl, SyncBadge, TvlBanner } from "../components/MarketWidgets";
import { MarketActions } from "../components/MarketActions";
import { MyPosition, type Preview } from "../components/MyPosition";
import { CipherValue } from "../components/viz/CipherValue";
import { RateCurve } from "../components/viz/RateCurve";
import { UtilizationArc } from "../components/viz/UtilizationArc";
import { useDecryption } from "../context/DecryptionContext";
import { MARKET_ABI, ORACLE_ABI } from "../lib/abis";
import { ADDRESSES, MARKETS, type AssetInfo, type MarketInfo } from "../lib/config";
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
    <div className="max-w-6xl mx-auto px-4 pb-16 pt-8 space-y-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Markets</h2>
        <p className="text-xs text-t2 mt-1">Isolated FHE lending pairs on official registry assets.</p>
      </div>

      <TvlBanner />

      {/* column header for the market table */}
      <div className="hidden md:grid grid-cols-[1.7fr_1fr_0.8fr_0.8fr_72px_36px] gap-4 items-center px-5 pt-2">
        <span className="label">Pair</span>
        <span className="label text-right">TVL</span>
        <span className="label text-right">Supply APR</span>
        <span className="label text-right">Borrow APR</span>
        <span className="label text-center">Util</span>
        <span />
      </div>

      <div className="space-y-2.5 !mt-2">
        {MARKETS.map((market, i) => (
          <div key={market.address} id={`market-${i}`} className="scroll-mt-24">
            {openSet.has(i) ? (
              <FeaturedMarket market={market} snap={snapshots.get(market.address)} onCollapse={() => toggleMarket(i)} />
            ) : (
              <CollapsedMarketRow market={market} snap={snapshots.get(market.address)} onOpen={() => toggleMarket(i)} />
            )}
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4 pt-2">
        <ActivityFeed />
        <div className="space-y-4">
          <div className="panel p-4 text-xs text-t2 leading-relaxed">
            All assets are official Zama registry wrappers, re-validated on-chain at market creation.
            Assets marked ◆ use posted feeds; the rest price off live Chainlink.
          </div>
          <Link to="/liquidations" className="panel panel-hover p-5 block group">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="w-9 h-9 rounded-xl well grid place-items-center text-accent shrink-0">
                  <IconScale size={17} />
                </span>
                <div>
                  <div className="text-sm font-bold">Liquidations & keeper desk</div>
                  <p className="text-[11px] text-t2 mt-1">
                    One-bit health checks, live flag board, encrypted liquidations.
                  </p>
                </div>
              </div>
              <IconArrowRight size={16} className="text-t3 group-hover:text-accent group-hover:translate-x-1 transition-all shrink-0" />
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

function TokenBadge({ asset, tone, size = "lg", z }: {
  asset: AssetInfo;
  tone: "collateral" | "debt";
  size?: "sm" | "lg";
  z?: boolean;
}) {
  const dim = size === "lg" ? "w-10 h-10 text-base" : "w-7 h-7 text-xs";
  const toneCls =
    tone === "collateral"
      ? "text-accent-2 bg-accent-2/10 border-accent-2/25"
      : "text-accent bg-accent/10 border-accent/25";
  return (
    <span className={`${dim} ${toneCls} ${z ? "z-10" : ""} rounded-full border grid place-items-center font-bold shrink-0`} style={{ backgroundColor: "var(--card)" }}>
      {asset.logo}
    </span>
  );
}

function FeaturedMarket({ market, snap, onCollapse }: { market: MarketInfo; snap: MarketSnapshot | undefined; onCollapse: () => void }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const reads = useMarketReads(market);
  const u6 = reads.borrowApr6 !== null ? utilizationFromApr6(reads.borrowApr6) : 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      className="card-glow p-4 sm:p-6 space-y-4 sm:space-y-5"
    >
      {/* header strip */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="flex -space-x-2.5">
            <TokenBadge asset={market.collateral} tone="collateral" z />
            <TokenBadge asset={market.debt} tone="debt" />
          </div>
          <div>
            <div className="font-display font-bold text-lg sm:text-xl leading-tight flex items-center gap-2">
              {market.collateral.symbol} <span className="text-t3 font-medium">/</span> {market.debt.symbol}
              <LowAnonymityBadge market={market} />
            </div>
            <div className="text-[11px] text-t2 mt-0.5">
              Deposit {market.collateral.symbol} · Borrow {market.debt.symbol}
              {market.collateral.postedFeed && <span className="text-accent ml-2">◆ Posted feed</span>}
            </div>
          </div>
        </div>
        <button onClick={onCollapse} className="btn-icon sm:order-last" title="Collapse">
          <IconMinus size={16} />
        </button>

        <div className="grid grid-cols-2 sm:flex items-center gap-4 sm:gap-6 w-full sm:w-auto">
          <HeaderStat label="Supply APR" value={reads.supplyApr6 !== null ? aprPct(reads.supplyApr6) : "—"} color="text-pos" />
          <HeaderStat label="Borrow APR" value={reads.borrowApr6 !== null ? aprPct(reads.borrowApr6) : "—"} color="text-accent" />
          <HeaderStat
            label={`${market.collateral.symbol} price`}
            value={reads.collatPrice8 !== null ? priceUsd(reads.collatPrice8) : "—"}
            color="text-t1"
          />
          <div className="justify-self-end sm:justify-self-auto">
            <UtilizationArc utilization6={u6} size={54} />
          </div>
        </div>
      </div>

      {/* TVL + sync freshness for this market */}
      <div className="flex flex-wrap items-center justify-between gap-2 well px-4 py-2.5">
        <MarketTvl snap={snap} />
        <SyncBadge market={market} snap={snap} />
      </div>

      <MyPosition market={market} preview={preview} />

      <div className="grid lg:grid-cols-[1fr_auto] gap-4 items-start">
        <div className="panel p-4 sm:p-5">
          <div className="label text-accent mb-3">Borrow — collateral & loan</div>
          <MarketActions market={market} group="borrow" onPreview={setPreview} />
        </div>
        <div className="panel p-5 hidden lg:block">
          <div className="label mb-3">Interest rate model</div>
          <RateCurve utilization6={u6} />
        </div>
      </div>

      <EarnPanel market={market} onPreview={setPreview} />
    </motion.div>
  );
}

/** The lender side as its own clearly separated surface. */
function EarnPanel({ market, onPreview }: {
  market: MarketInfo;
  onPreview: (p: Preview | null) => void;
}) {
  const { decrypted, publicView, positions } = useDecryption();
  const reads = useMarketReads(market);
  const position = positions.find((p) => p.market.address === market.address);
  const hidden = !decrypted || publicView;

  return (
    <div className="panel p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <div className="label text-pos mb-1.5">Earn — lend {market.debt.symbol}</div>
          <p className="text-[11px] text-t2 max-w-xl leading-snug">
            Separate from any loan: supply {market.debt.symbol}, earn the supply APR, withdraw while the
            pool has cash.
          </p>
        </div>
        <div className="well rounded-xl p-3.5 min-w-48">
          <div className="label mb-1">Supplied ({market.debt.symbol})</div>
          <div className="font-mono font-bold text-lg text-pos tabular">
            <CipherValue value={position ? fmt6(position.supplied, 2) : "0"} hidden={hidden} chars={8} />
          </div>
          <div className="text-[11px] text-t2 font-mono">
            {reads.supplyApr6 !== null ? aprPct(reads.supplyApr6) : "—"} APR
          </div>
        </div>
      </div>
      <MarketActions market={market} group="earn" onPreview={onPreview} />
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
      className="panel panel-hover w-full p-4 md:px-5 grid grid-cols-[1fr_auto] md:grid-cols-[1.7fr_1fr_0.8fr_0.8fr_72px_36px] gap-3 md:gap-4 items-center text-left cursor-pointer group"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex -space-x-2">
          <TokenBadge asset={market.collateral} tone="collateral" size="sm" z />
          <TokenBadge asset={market.debt} tone="debt" size="sm" />
        </div>
        <span className="font-display font-bold text-sm truncate">
          {market.collateral.symbol} <span className="text-t3 font-normal">/</span> {market.debt.symbol}
        </span>
        {market.collateral.postedFeed && <span className="text-accent text-[10px]" title="Posted feed">◆</span>}
      </div>

      <span className="hidden md:block text-right text-xs font-mono text-t2 tabular">
        {tvl ? usd(tvl.totalUsd) : "—"}
      </span>
      <span className="hidden md:block text-right text-xs font-mono font-bold text-pos tabular">
        {reads.supplyApr6 !== null ? aprPct(reads.supplyApr6) : "—"}
      </span>
      <span className="hidden md:block text-right text-xs font-mono font-bold text-accent tabular">
        {reads.borrowApr6 !== null ? aprPct(reads.borrowApr6) : "—"}
      </span>
      <span className="hidden md:grid place-items-center">
        <UtilizationArc utilization6={u6} size={36} />
      </span>

      {/* mobile compact metrics */}
      <span className="md:hidden flex items-center gap-2.5 text-[11px] font-mono shrink-0">
        <span className="text-pos">{reads.supplyApr6 !== null ? aprPct(reads.supplyApr6) : "—"}</span>
        <span className="text-accent">{reads.borrowApr6 !== null ? aprPct(reads.borrowApr6) : "—"}</span>
      </span>

      <span className="hidden md:grid place-items-center text-t3 group-hover:text-accent transition-colors">
        <IconPlus size={15} />
      </span>
    </motion.button>
  );
}

function HeaderStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="sm:text-right">
      <div className="label">{label}</div>
      <div className={`font-mono font-bold tabular ${color}`}>{value}</div>
    </div>
  );
}
