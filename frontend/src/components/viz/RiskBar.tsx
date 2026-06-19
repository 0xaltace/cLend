import { motion } from "framer-motion";

/**
 * Borrow-power bar: debt vs the LTV ceiling and LLTV liquidation boundary.
 * Fill animates from zero on mount; while the user types, a striped ghost
 * segment previews the projected debt level live.
 */
export function RiskBar({ debtUsd, projectedDebtUsd, maxBorrowUsd, liqUsd }: {
  debtUsd: number;
  projectedDebtUsd?: number;
  maxBorrowUsd: number;
  liqUsd: number;
}) {
  // No collateral -> no borrow power: skip the bar instead of stacking
  // zero-position markers on top of each other.
  if (liqUsd <= 0) {
    return (
      <div className="bg-panel-2/60 border border-dashed border-line rounded-xl px-3 py-2.5 text-xs text-slate-400">
        <span className="font-bold text-slate-300">No borrowing power yet</span> — add collateral to
        unlock the borrow meter.
      </div>
    );
  }

  const span = Math.max(liqUsd * 1.12, 1);
  const pct = (v: number) => Math.min(100, (v / span) * 100);

  const used = pct(debtUsd);
  const projected = projectedDebtUsd !== undefined ? pct(projectedDebtUsd) : null;
  const ltvMark = pct(maxBorrowUsd);
  const liqMark = pct(liqUsd);

  const ref = projectedDebtUsd ?? debtUsd;
  const usage = maxBorrowUsd > 0 ? ref / maxBorrowUsd : 0;
  const barColor = usage < 0.6 ? "#34d399" : usage < 0.9 ? "#fbd24d" : "#f87171";

  const fmtUsd = (v: number) => `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  return (
    <div>
      <div className="flex justify-between text-[11px] text-slate-400 mb-1">
        <span>
          Borrowed <span className="font-mono text-slate-200">{fmtUsd(debtUsd)}</span>
          {projected !== null && projectedDebtUsd !== debtUsd && (
            <span className="font-mono text-accent-2"> → {fmtUsd(projectedDebtUsd!)}</span>
          )}
        </span>
        <span>
          Limit <span className="font-mono text-slate-200">{fmtUsd(maxBorrowUsd)}</span>
        </span>
      </div>
      <div className="relative h-4 bg-panel-2 rounded-full border border-line">
        {/* main fill: sweeps 0 -> value on mount, rides the projection live while typing */}
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${projected ?? used}%` }}
          transition={
            projected !== null
              ? { type: "spring", stiffness: 150, damping: 20 }
              : { duration: 1.1, ease: [0.22, 0.9, 0.3, 1] }
          }
          style={{
            background:
              projected !== null
                ? `repeating-linear-gradient(45deg, ${barColor}, ${barColor} 6px, ${barColor}99 6px, ${barColor}99 11px)`
                : barColor,
          }}
        />
        {/* tick marking the CURRENT debt while a projection is shown */}
        {projected !== null && projected !== used && (
          <div className="absolute -top-1 bottom-[-2px] w-0.5 bg-slate-200/80" style={{ left: `${used}%` }} />
        )}
        <div className="absolute -top-1.5 bottom-[-6px] w-0.5 bg-accent" style={{ left: `${ltvMark}%` }} />
        <div className="absolute -top-5 text-[9px] font-bold text-accent -translate-x-1/2" style={{ left: `${ltvMark}%` }}>
          MAX&nbsp;BORROW
        </div>
        <div className="absolute -top-1.5 bottom-[-6px] w-0.5 bg-neg" style={{ left: `${liqMark}%` }} />
        <div className="absolute -bottom-5 text-[9px] font-bold text-neg -translate-x-1/2" style={{ left: `${liqMark}%` }}>
          LIQUIDATION
        </div>
      </div>
      <div className="h-5" />
    </div>
  );
}
