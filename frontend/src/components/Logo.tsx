/**
 * "The One Bit" mark: a 2x2 cipher grid — three cells stay dark (encrypted),
 * one glows gold: the single bit cLend ever reveals. The protocol, in four dots.
 */
export function LogoMark({ size = 34 }: { size?: number }) {
  const r = size * 0.16;
  const cell = size * 0.30;
  const gap = size * 0.115;
  const pad = (size - cell * 2 - gap) / 2;
  const pos = [
    [pad, pad],
    [pad + cell + gap, pad],
    [pad, pad + cell + gap],
  ];
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <rect width={size} height={size} rx={size * 0.26} fill="#111827" stroke="#243044" />
      {pos.map(([x, y], i) => (
        <rect key={i} x={x} y={y} width={cell} height={cell} rx={r} fill="#1f2c42" stroke="#33415c" strokeWidth={0.75} />
      ))}
      {/* the one revealed bit */}
      <rect
        x={pad + cell + gap}
        y={pad + cell + gap}
        width={cell}
        height={cell}
        rx={r}
        fill="#fbd24d"
      >
        <animate attributeName="opacity" values="1;0.55;1" dur="3.2s" repeatCount="indefinite" />
      </rect>
    </svg>
  );
}

export function Logo({ size = 34, withTag = false }: { size?: number; withTag?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark size={size} />
      <span className="leading-tight">
        <span className="font-black text-lg tracking-tight">
          <span className="text-accent">c</span>Lend
        </span>
        {withTag && (
          <span className="block text-[10px] text-slate-400 -mt-0.5">Fully Encrypted Lending</span>
        )}
      </span>
    </span>
  );
}
