/** Compact utilization ring for market cards. */
export function UtilizationArc({ utilization6, size = 54 }: { utilization6: number; size?: number }) {
  const u = Math.min(1, utilization6 / 1e6);
  const r = size / 2 - 5;
  const c = 2 * Math.PI * r;
  const color = u < 0.6 ? "var(--pos)" : u < 0.85 ? "var(--accent)" : "var(--neg)";

  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--viz-track)" strokeWidth={5} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={5}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${c * u} ${c}`}
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute text-[10px] font-mono font-bold" style={{ color }}>
        {(u * 100).toFixed(0)}%
      </div>
    </div>
  );
}
