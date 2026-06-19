/**
 * The kinked interest-rate model as a small SVG chart with the market's live
 * utilization point on the curve. Base 0%, +4% to the 80% kink, +60% beyond.
 */
export function RateCurve({ utilization6, width = 280, height = 110 }: {
  utilization6: number; // 1e6 scale
  width?: number;
  height?: number;
}) {
  const KINK = 0.8;
  const SLOPE1 = 0.04;
  const SLOPE2 = 0.6;
  const maxRate = SLOPE1 + SLOPE2; // 64% at U=100%

  const rate = (u: number) => (u <= KINK ? (SLOPE1 * u) / KINK : SLOPE1 + (SLOPE2 * (u - KINK)) / (1 - KINK));

  const px = (u: number) => 28 + u * (width - 40);
  const py = (r: number) => height - 22 - (r / maxRate) * (height - 38);

  const points = Array.from({ length: 51 }, (_, i) => {
    const u = i / 50;
    return `${px(u)},${py(rate(u))}`;
  }).join(" ");

  const u = Math.min(1, utilization6 / 1e6);
  const liveRate = rate(u);

  return (
    <svg width={width} height={height} className="overflow-visible">
      {/* axes */}
      <line x1={28} y1={height - 22} x2={width - 10} y2={height - 22} stroke="#243044" />
      <line x1={28} y1={12} x2={28} y2={height - 22} stroke="#243044" />
      {/* kink guide */}
      <line x1={px(KINK)} y1={py(rate(KINK))} x2={px(KINK)} y2={height - 22} stroke="#243044" strokeDasharray="3 3" />
      <text x={px(KINK)} y={height - 10} fontSize={9} fill="#64748b" textAnchor="middle" fontFamily="monospace">
        kink 80%
      </text>
      {/* curve */}
      <polyline points={points} fill="none" stroke="#4dc8fb" strokeWidth={2} />
      {/* live point */}
      <circle cx={px(u)} cy={py(liveRate)} r={5} fill="#fbd24d" stroke="#0b0f17" strokeWidth={2} />
      <text x={px(u)} y={py(liveRate) - 10} fontSize={10} fill="#fbd24d" textAnchor="middle" fontFamily="monospace" fontWeight="bold">
        U {(u * 100).toFixed(0)}% → {(liveRate * 100).toFixed(2)}%
      </text>
      <text x={10} y={20} fontSize={9} fill="#64748b" fontFamily="monospace" transform={`rotate(-90 14 ${height / 2})`} textAnchor="middle">
        borrow APR
      </text>
    </svg>
  );
}
