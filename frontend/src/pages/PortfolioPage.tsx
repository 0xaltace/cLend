import { useAccount } from "wagmi";

import { IconLock, IconNest, IconRefresh, IconUnlock } from "../components/Icons";
import { CipherValue } from "../components/viz/CipherValue";
import { HealthGauge } from "../components/viz/HealthGauge";
import { LiquidationScale } from "../components/viz/LiquidationScale";
import { useDecryption } from "../context/DecryptionContext";
import { ASSETS } from "../lib/config";
import { computePosition } from "../lib/positionMath";

export function PortfolioPage() {
  const { address } = useAccount();
  const { decrypted, publicView, busy, error, wallet, positions, decryptAll } = useDecryption();
  const hidden = !decrypted || publicView;

  // only markets where this address actually has something
  const active = positions.filter((p) => p.collat > 0n || p.debt > 0n || p.shares > 0n);
  const views = active.map((p) => ({ p, v: computePosition(p) }));
  const totals = views.reduce(
    (acc, { v }) => ({
      collat: acc.collat + v.collatUsd,
      debt: acc.debt + v.debtUsd,
      supplied: acc.supplied + v.suppliedUsd,
    }),
    { collat: 0, debt: 0, supplied: 0 },
  );
  const netWorth = totals.collat + totals.supplied - totals.debt;

  if (!address) {
    return (
      <div className="max-w-6xl mx-auto px-4 pt-12">
        <div className="panel p-10 text-center text-t2 text-sm">
          <div className="w-12 h-12 rounded-2xl well grid place-items-center mx-auto mb-3 text-accent">
            <IconLock size={20} />
          </div>
          Connect a wallet to view your encrypted portfolio.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 pb-16 pt-8 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-bold tracking-tight">Portfolio</h2>
          <p className="text-xs text-t2 max-w-xl mt-1">
            Everything decrypts locally — only you can read the results. Two wallet signatures, valid 24h.
          </p>
        </div>
        <button className="btn-primary shrink-0 inline-flex items-center gap-2" onClick={decryptAll} disabled={busy}>
          {decrypted ? <IconRefresh size={14} /> : <IconUnlock size={14} />}
          {busy ? "Decrypting…" : decrypted ? "Refresh" : "Decrypt portfolio"}
        </button>
      </div>

      {error && <p className="text-neg text-xs">{error}</p>}

      {/* Net worth strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Summary label="Net worth" usd={netWorth} hidden={hidden} big />
        <Summary label="Supplied (earning)" usd={totals.supplied} hidden={hidden} accent="pos" />
        <Summary label="Collateral posted" usd={totals.collat} hidden={hidden} />
        <Summary label="Debt owed" usd={totals.debt} hidden={hidden} accent="neg" />
      </div>

      {/* Wallet */}
      <div className="panel p-5">
        <div className="label mb-3">Wallet — confidential tokens</div>
        <div className="grid md:grid-cols-3 gap-2.5">
          {Object.values(ASSETS).map((a) => (
            <div key={a.symbol} className="well rounded-xl px-3.5 py-3 flex justify-between items-center">
              <span className="text-sm font-bold flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-full grid place-items-center text-xs text-accent-2 bg-gradient-to-br from-accent-2/20 to-accent-2/[0.03] border border-accent-2/25">
                  {a.logo}
                </span>
                {a.symbol}
              </span>
              <CipherValue
                value={((Number(wallet[a.symbol] ?? 0n)) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                hidden={hidden}
                chars={9}
                className="font-bold tabular"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Per-market positions — only where this address is active */}
      {decrypted && views.length === 0 && (
        <div className="panel p-10 text-center">
          <div className="w-12 h-12 rounded-2xl well grid place-items-center mx-auto mb-3 text-t3">
            <IconNest size={22} />
          </div>
          <div className="font-bold mb-1">No positions yet</div>
          <p className="text-xs text-t2 mb-5">Supply, add collateral, or borrow and it will appear here.</p>
          <a href="/app" className="btn-primary inline-block">
            Explore markets
          </a>
        </div>
      )}
      {views.map(({ p, v }) => (
        <div key={p.market.address} className="panel p-5">
          <div className="font-display font-bold text-sm mb-4 flex items-center gap-2">
            {p.market.collateral.symbol} <span className="text-t3">→</span> {p.market.debt.symbol}
          </div>
          <div className="grid lg:grid-cols-[auto_1fr] gap-6 items-center">
            <HealthGauge hf={hidden ? null : v.healthFactor} size={130} />
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2.5 text-sm">
                <Mini label="Collateral" value={`${v.collatAmount.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${p.market.collateral.symbol}`} hidden={hidden} />
                <Mini label="Debt" value={`${v.debtAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${p.market.debt.symbol}`} hidden={hidden} accent="neg" />
                <Mini label="Supplied" value={`${v.suppliedAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${p.market.debt.symbol}`} hidden={hidden} accent="pos" />
              </div>
              {!hidden && (
                <LiquidationScale symbol={p.market.collateral.symbol} currentPrice={v.collatPrice} liqPrice={v.liqPrice} />
              )}
            </div>
          </div>
        </div>
      ))}

      {decrypted && (
        <p className="text-[11px] text-t3 text-center">
          Tip: the eye toggle in the nav shows this page as the public sees it.
        </p>
      )}
    </div>
  );
}

function Summary({ label, usd, hidden, accent, big }: {
  label: string;
  usd: number;
  hidden: boolean;
  accent?: "pos" | "neg";
  big?: boolean;
}) {
  const color = accent === "pos" ? "text-pos" : accent === "neg" ? "text-neg" : "text-t1";
  return (
    <div className={big ? "card-glow p-5" : "panel p-5"}>
      <div className="label mb-1.5">{label}</div>
      <div className={`font-mono font-bold tabular ${big ? "text-3xl" : "text-lg"} ${hidden ? "" : color}`}>
        <CipherValue
          value={`$${usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          hidden={hidden}
          chars={8}
        />
      </div>
    </div>
  );
}

function Mini({ label, value, hidden, accent }: { label: string; value: string; hidden: boolean; accent?: "pos" | "neg" }) {
  const color = accent === "pos" ? "text-pos" : accent === "neg" ? "text-neg" : "text-t1";
  return (
    <div className="well rounded-xl p-3">
      <div className="label mb-1">{label}</div>
      <div className={`font-mono font-bold text-xs tabular ${hidden ? "" : color}`}>
        <CipherValue value={value} hidden={hidden} chars={10} />
      </div>
    </div>
  );
}
