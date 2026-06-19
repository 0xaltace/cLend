import { useAccount } from "wagmi";

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
      <div className="max-w-5xl mx-auto px-4 pt-10">
        <div className="panel p-8 text-center text-slate-400 text-sm">
          Connect a wallet to view your encrypted portfolio.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 pb-16 pt-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-black">Portfolio</h2>
          <p className="text-xs text-slate-400 max-w-xl">
            Everything decrypts locally — only you can read the results. The first decrypt asks for two
            signatures, one for token balances and one for market positions (the SDK allows 10 contracts
            per signature). Both stay valid for 24 hours.
          </p>
        </div>
        <button className="btn-primary shrink-0" onClick={decryptAll} disabled={busy}>
          {busy ? "Decrypting…" : decrypted ? "Refresh" : "🔓 Decrypt portfolio"}
        </button>
      </div>

      {error && <p className="text-neg text-xs">{error}</p>}

      {/* Net worth strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Summary label="Net worth" usd={netWorth} hidden={hidden} big />
        <Summary label="Supplied (earning)" usd={totals.supplied} hidden={hidden} accent="pos" />
        <Summary label="Collateral posted" usd={totals.collat} hidden={hidden} />
        <Summary label="Debt owed" usd={totals.debt} hidden={hidden} accent="neg" />
      </div>

      {/* Wallet */}
      <div className="panel p-4">
        <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-2">Wallet — confidential tokens</div>
        <div className="grid md:grid-cols-3 gap-2">
          {Object.values(ASSETS).map((a) => (
            <div key={a.symbol} className="bg-panel-2 rounded-xl px-3 py-2.5 flex justify-between items-center">
              <span className="text-sm font-bold">
                <span className="text-accent-2 mr-1.5">{a.logo}</span>
                {a.symbol}
              </span>
              <CipherValue
                value={((Number(wallet[a.symbol] ?? 0n)) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                hidden={hidden}
                chars={9}
                className="font-bold"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Per-market positions — only where this address is active */}
      {decrypted && views.length === 0 && (
        <div className="panel p-8 text-center">
          <div className="text-3xl mb-2">🪺</div>
          <div className="font-bold mb-1">No positions yet</div>
          <p className="text-xs text-slate-400 mb-4">
            Supply, add collateral, or borrow in any market and it will appear here.
          </p>
          <a href="/app" className="btn-primary inline-block">
            Explore markets
          </a>
        </div>
      )}
      {views.map(({ p, v }) => (
        <div key={p.market.address} className="panel p-4">
          <div className="font-bold text-sm mb-3">
            {p.market.collateral.symbol} → {p.market.debt.symbol}
          </div>
          <div className="grid lg:grid-cols-[auto_1fr] gap-5 items-center">
            <HealthGauge hf={hidden ? null : v.healthFactor} size={130} />
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2 text-sm">
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
        <p className="text-[11px] text-slate-500 text-center">
          Tip: the 🔒 Chain view toggle in the nav shows this page as the public sees it.
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
  const color = accent === "pos" ? "text-pos" : accent === "neg" ? "text-neg" : "text-slate-100";
  return (
    <div className={`panel p-4 ${big ? "md:col-span-1 border-accent/40" : ""}`}>
      <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">{label}</div>
      <div className={`font-mono font-black ${big ? "text-2xl" : "text-lg"} ${hidden ? "" : color}`}>
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
  const color = accent === "pos" ? "text-pos" : accent === "neg" ? "text-neg" : "text-slate-100";
  return (
    <div className="bg-panel-2 rounded-xl p-2.5">
      <div className="text-[10px] text-slate-400 mb-0.5">{label}</div>
      <div className={`font-mono font-bold text-xs ${hidden ? "" : color}`}>
        <CipherValue value={value} hidden={hidden} chars={10} />
      </div>
    </div>
  );
}
