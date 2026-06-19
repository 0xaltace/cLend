import { motion } from "framer-motion";

/**
 * Price runway: where the collateral price is now vs the price at which the
 * position becomes liquidatable. While typing, a cyan ghost marker previews
 * where the liquidation point would move.
 */
export function LiquidationScale({ symbol, currentPrice, liqPrice, projectedLiqPrice }: {
  symbol: string;
  currentPrice: number;
  liqPrice: number | null; // null = no debt, cannot be liquidated
  projectedLiqPrice?: number | null;
}) {
  const ghost = projectedLiqPrice !== undefined && projectedLiqPrice !== liqPrice ? projectedLiqPrice : undefined;
  const effective = ghost !== undefined && ghost !== null ? ghost : liqPrice;

  if (effective === null || effective <= 0) {
    return (
      <div className="text-xs text-slate-400">
        <span className="text-pos font-bold">No liquidation price</span> — without debt, the price of{" "}
        {symbol} cannot liquidate this position.
      </div>
    );
  }

  const candidates = [currentPrice, effective, liqPrice ?? effective].filter((v): v is number => v !== null && v > 0);
  const lo = Math.min(...candidates) * 0.7;
  const hi = Math.max(...candidates) * 1.15;
  const pct = (v: number) => ((v - lo) / (hi - lo)) * 100;
  const dropPct = ((currentPrice - effective) / currentPrice) * 100;
  const fmt = (v: number) => `$${v.toLocaleString(undefined, { maximumFractionDigits: v < 10 ? 4 : 0 })}`;

  return (
    <div>
      <div className="text-[11px] text-slate-400 mb-1.5">
        {symbol} liquidation runway —{" "}
        {dropPct > 0 ? (
          <span className="text-slate-200">
            {ghost !== undefined && <span className="text-accent-2 font-bold">projected: </span>}
            price must fall <span className="font-mono font-bold text-accent">{dropPct.toFixed(1)}%</span> to{" "}
            <span className="font-mono font-bold text-neg">{fmt(effective)}</span> before liquidation
          </span>
        ) : (
          <span className="text-neg font-bold">BELOW LIQUIDATION PRICE</span>
        )}
      </div>
      <div className="relative h-3 rounded-full bg-gradient-to-r from-neg/60 via-amber-400/50 to-pos/60">
        {/* current liquidation marker */}
        {liqPrice !== null && liqPrice > 0 && (
          <>
            <div className="absolute -top-1 bottom-[-4px] w-0.5 bg-neg" style={{ left: `${pct(liqPrice)}%` }} />
            <div className="absolute top-4 text-[9px] font-mono text-neg -translate-x-1/2 whitespace-nowrap" style={{ left: `${pct(liqPrice)}%` }}>
              {fmt(liqPrice)}
            </div>
          </>
        )}
        {/* projected ghost liquidation marker */}
        {ghost !== undefined && ghost !== null && ghost > 0 && (
          <motion.div
            className="absolute -top-1 bottom-[-4px] w-0.5 bg-accent-2"
            animate={{ left: `${pct(ghost)}%` }}
            transition={{ type: "spring", stiffness: 160, damping: 22 }}
          />
        )}
        {/* current price marker */}
        <div
          className="absolute -top-2 -translate-x-1/2 w-3 h-3 rotate-45 bg-slate-100 border border-ink rounded-[3px] shadow"
          style={{ left: `${pct(currentPrice)}%` }}
        />
        <div className="absolute -top-7 text-[9px] font-mono text-slate-200 -translate-x-1/2 whitespace-nowrap" style={{ left: `${pct(currentPrice)}%` }}>
          Now {fmt(currentPrice)}
        </div>
      </div>
      <div className="h-6" />
    </div>
  );
}
