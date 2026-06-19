/** Compact utilization ring for market cards. */
export function UtilizationArc({ utilization6, size = 54 }: { utilization6: number; size?: number }) {
  const u = Math.min(1, utilization6 / 1e6);
  const r = size / 2 - 5;
  const c = 2 * Math.PI * r;
  const color = u < 0.6 ? "#34d399" : u < 0.85 ? "#fbd24d" : "#f87171";

  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#243044" strokeWidth={5} fill="none" />
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
