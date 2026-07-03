import { motion } from "framer-motion";

/**
 * Speedometer-style health dial with ONE needle. It springs from the danger
 * end on mount and rides the live projection while the user types or drags
 * the stress slider. Coordinate-based animation — no CSS rotation pivots.
 */
export function HealthGauge({ hf, projectedHf, size = 170 }: {
  hf: number | null;
  projectedHf?: number | null;
  size?: number;
}) {
  const w = size;
  const h = size * 0.6;
  const cx = w / 2;
  const cy = h * 0.94;
  const r = w * 0.4;

  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  // Arc divides on the tick grid: red [0, RED], yellow [RED, YEL], green [YEL, 1].
  const RED = 0.167; // 2nd tick — liquidation boundary (HF 1.0)
  const YEL = 0.333; // 3rd tick — safe boundary (HF 2.0)
  // Mapping:
  //  HF 0.8..1.0 -> 0..RED        (red, linear)
  //  HF 1.0..2.0 -> RED..YEL      (yellow, linear)
  //  HF 2.0..30  -> YEL..0.90     (green, log-compressed: needle creeps slowly)
  const tOf = (value: number | null) => {
    if (value === null) return 0.93; // infinity (no debt)
    if (value <= 1) return clamp((value - 0.8) / 0.2, 0, 1) * RED;
    if (value <= 2) return RED + ((value - 1) / 1) * (YEL - RED);
    const t = Math.min(1, Math.log(value / 2) / Math.log(30 / 2));
    return YEL + t * (0.9 - YEL);
  };
  const tipOf = (value: number | null, len = 0.84) => {
    const a = Math.PI * (1 - tOf(value));
    return { x: cx + r * len * Math.cos(a), y: cy - r * len * Math.sin(a) };
  };

  const hasProjection = projectedHf !== undefined;
  const display = hasProjection ? projectedHf : hf;
  const tip = tipOf(display);
  const startTip = tipOf(0.8); // mount: rise from the danger end

  const arc = (from: number, to: number, color: string) => {
    const a0 = Math.PI * (1 - from);
    const a1 = Math.PI * (1 - to);
    const p0 = { x: cx + r * Math.cos(a0), y: cy - r * Math.sin(a0) };
    const p1 = { x: cx + r * Math.cos(a1), y: cy - r * Math.sin(a1) };
    return (
      <path
        d={`M ${p0.x} ${p0.y} A ${r} ${r} 0 0 1 ${p1.x} ${p1.y}`}
        stroke={color}
        strokeWidth={10}
        strokeLinecap="round"
        fill="none"
        opacity={0.9}
      />
    );
  };

  const ticks = [0, 0.167, 0.333, 0.5, 0.667, 0.833, 1].map((t) => {
    const a = Math.PI * (1 - t);
    return (
      <line
        key={t}
        x1={cx + (r - 9) * Math.cos(a)}
        y1={cy - (r - 9) * Math.sin(a)}
        x2={cx + (r - 3) * Math.cos(a)}
        y2={cy - (r - 3) * Math.sin(a)}
        stroke="var(--viz-tick)"
        strokeWidth={1.5}
      />
    );
  });

  const fmt = (v: number | null) => (v === null ? "∞" : v > 99 ? ">99" : v.toFixed(2));
  // Green only at HF >= 2.0; amber 1.0–2.0; red below 1.0.
  const zone = display === null || display >= 2 ? "SAFE" : display >= 1.1 ? "CAUTION" : display >= 1 ? "AT RISK" : "LIQUIDATABLE";
  const zoneColor = display === null || display >= 2 ? "var(--pos)" : display >= 1 ? "var(--accent)" : "var(--neg)";

  return (
    <div className="flex flex-col items-center">
      <svg width={w} height={h} className="overflow-visible">
        {/* red to 2nd tick (HF<1.0), yellow 2nd–3rd tick (HF 1–2), green the rest (HF 2+) */}
        {arc(0, RED - 0.015, "var(--neg)")}
        {arc(RED + 0.015, YEL - 0.015, "var(--accent)")}
        {arc(YEL + 0.015, 1, "var(--pos)")}
        {ticks}
        {/* HF = 1.0 liquidation boundary */}
        {(() => {
          const a = Math.PI * (1 - tOf(1));
          return (
            <line
              x1={cx + (r - 13) * Math.cos(a)}
              y1={cy - (r - 13) * Math.sin(a)}
              x2={cx + (r + 13) * Math.cos(a)}
              y2={cy - (r + 13) * Math.sin(a)}
              stroke="var(--neg)"
              strokeWidth={2}
              strokeDasharray="3 2"
            />
          );
        })()}

        {/* the needle */}
        <motion.line
          x1={cx}
          y1={cy}
          initial={{ x2: startTip.x, y2: startTip.y }}
          animate={{ x2: tip.x, y2: tip.y }}
          transition={{ type: "spring", stiffness: 48, damping: 11.5, mass: 1 }}
          stroke="var(--t1)"
          strokeWidth={3.5}
          strokeLinecap="round"
        />
        <circle cx={cx} cy={cy} r={6} fill="var(--card)" stroke={zoneColor} strokeWidth={2.5} />
      </svg>

      {/* readout below the dial — label in FRONT of the number */}
      <div className="text-center mt-2">
        <div className="font-mono font-black text-2xl leading-none" style={{ color: zoneColor }}>
          {hasProjection && <span className="text-[10px] text-accent-2 font-bold align-middle mr-1.5">PROJECTED</span>}
          {fmt(display)}
        </div>
        <div className="text-[10px] font-bold tracking-widest mt-1" style={{ color: zoneColor }}>
          {zone} · HEALTH FACTOR
        </div>
        {hasProjection && (
          <div className="text-[10px] font-mono text-t3 mt-0.5">now {fmt(hf)}</div>
        )}
      </div>
    </div>
  );
}
