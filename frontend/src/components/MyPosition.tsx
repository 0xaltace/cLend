import { useState } from "react";
import { useAccount } from "wagmi";

import { IconLock, IconUnlock } from "./Icons";
import { useDecryption } from "../context/DecryptionContext";
import type { MarketInfo } from "../lib/config";
import { computePosition, projectPosition, LLTV, type PreviewAction } from "../lib/positionMath";
import { CipherValue } from "./viz/CipherValue";
import { HealthGauge } from "./viz/HealthGauge";
import { LiquidationScale } from "./viz/LiquidationScale";
import { RiskBar } from "./viz/RiskBar";

export interface Preview {
  fn: PreviewAction;
  amount6: bigint;
}

/**
 * The position panel: health dial, borrow-power bar, liquidation runway.
 * Meters live-track typed amounts (ghost needles), replay their 0 -> value
 * sweep on every visit/market switch/decrypt, and a stress slider answers
 * "what if the collateral price moves X%".
 */
export function MyPosition({ market, preview }: { market: MarketInfo; preview: Preview | null }) {
  const { address } = useAccount();
  const { decrypted, publicView, positions, decryptAll, busy, error } = useDecryption();
  const [stressPct, setStressPct] = useState(0);

  const position = positions.find((p) => p.market.address === market.address);
  const view = position ? computePosition(position) : null;

  // typing preview wins; otherwise the stress slider provides the projection
  const typingView =
    position && preview && preview.amount6 > 0n
      ? computePosition(projectPosition(position, preview.fn, preview.amount6))
      : null;
  const stressedView =
    position && !typingView && stressPct !== 0
      ? computePosition({
          ...position,
          collatPrice8: (position.collatPrice8 * BigInt(100 + stressPct)) / 100n,
        })
      : null;
  const projectedView = typingView ?? stressedView;
  const hidden = !decrypted || publicView;

  if (!address) {
    return (
      <div className="panel p-6 text-sm text-t2 flex items-center gap-3">
        <span className="w-9 h-9 rounded-xl well grid place-items-center text-accent">
          <IconLock size={16} />
        </span>
        Connect a wallet to see your encrypted position.
      </div>
    );
  }

  const fmtAmt = (v: number, dp = 4) => v.toLocaleString(undefined, { maximumFractionDigits: dp });
  const fmtUsd = (v: number) => `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  // "what would save me" when the stress scenario turns lethal
  let rescue: string | null = null;
  if (stressedView && view && stressedView.healthFactor !== null && stressedView.healthFactor < 1) {
    const repayUsd = stressedView.debtUsd - stressedView.liqThresholdUsd;
    const addCollat = (stressedView.debtUsd / LLTV - stressedView.collatUsd) / stressedView.collatPrice;
    rescue = `To survive: repay ≥ ${fmtUsd(repayUsd)} or add ≥ ${fmtAmt(addCollat, 4)} ${market.collateral.symbol}`;
  }

  return (
    <div className="panel p-6">
      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <div>
          <h3 className="font-bold">Your position</h3>
          <p className="text-[11px] text-t2">
            {hidden
              ? "The chain stores only ciphertext. Decrypt locally to read it."
              : typingView
                ? "Live preview of this action."
                : stressedView
                  ? `Stress test — ${market.collateral.symbol} at ${stressPct > 0 ? "+" : ""}${stressPct}%.`
                  : "Decrypted locally — only you can see this."}
          </p>
        </div>
        {!decrypted && (
          <div className="text-right">
            <button className="btn-primary inline-flex items-center gap-2" onClick={decryptAll} disabled={busy}>
              <IconUnlock size={14} />
              {busy ? "Decrypting…" : "Decrypt position"}
            </button>
            <p className="text-[10px] text-t3 mt-1">Two wallet signatures, cached 24h.</p>
          </div>
        )}
      </div>

      {error && <p className="text-neg text-xs mb-3">{error}</p>}

      {/* key forces a full remount: the 0 -> value sweep replays on every market
          switch and every decrypt, not just the first load */}
      <div key={`${market.address}-${decrypted}`} className="grid lg:grid-cols-[auto_1fr] gap-6 items-center">
        <HealthGauge
          hf={hidden ? null : (view?.healthFactor ?? null)}
          projectedHf={!hidden && projectedView ? projectedView.healthFactor : undefined}
        />

        <div className="space-y-5">
          <div>
            <div className="label mb-2">
              Borrow side — Your loan
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Stat
                label={`Collateral (${market.collateral.symbol})`}
                value={view ? fmtAmt(view.collatAmount) : "0"}
                next={typingView && typingView.collatAmount !== view?.collatAmount ? fmtAmt(typingView.collatAmount) : null}
                sub={view ? fmtUsd((projectedView ?? view).collatUsd) : ""}
                hidden={hidden}
              />
              <Stat
                label={`Debt (${market.debt.symbol})`}
                value={view ? fmtAmt(view.debtAmount, 2) : "0"}
                next={typingView && typingView.debtAmount !== view?.debtAmount ? fmtAmt(typingView.debtAmount, 2) : null}
                sub={view ? fmtUsd(view.debtUsd) : ""}
                hidden={hidden}
                accent="neg"
              />
            </div>
          </div>

          {hidden ? (
            <div className="well rounded-xl p-4 text-center">
              <CipherValue value="" hidden chars={48} className="text-sm" />
              <div className="text-[10px] text-t3 mt-1.5">
                Risk meters render after local decryption — the chain cannot compute this view
              </div>
            </div>
          ) : (
            view && (
              <>
                <RiskBar
                  debtUsd={view.debtUsd}
                  projectedDebtUsd={projectedView ? projectedView.debtUsd : undefined}
                  maxBorrowUsd={(projectedView ?? view).maxBorrowUsd}
                  liqUsd={(projectedView ?? view).liqThresholdUsd}
                />
                <LiquidationScale
                  symbol={market.collateral.symbol}
                  currentPrice={(stressedView ?? view).collatPrice}
                  liqPrice={view.liqPrice}
                  projectedLiqPrice={typingView ? typingView.liqPrice : undefined}
                />

                {/* stress test: drag the collateral price, watch everything react */}
                <div className="well rounded-xl p-3.5">
                  <div className="flex items-center justify-between mb-2 text-[11px]">
                    <span className="font-bold text-t2">
                      Stress test — what if {market.collateral.symbol} moves?
                    </span>
                    <span className={`font-mono font-bold ${stressPct < 0 ? "text-neg" : stressPct > 0 ? "text-pos" : "text-t2"}`}>
                      {stressPct > 0 ? "+" : ""}
                      {stressPct}%
                      {stressedView && (
                        <span className="text-t2 font-normal">
                          {" "}
                          → HF{" "}
                          <span className={stressedView.healthFactor !== null && stressedView.healthFactor < 1 ? "text-neg font-bold" : "text-t1"}>
                            {stressedView.healthFactor === null ? "∞" : stressedView.healthFactor.toFixed(2)}
                          </span>
                        </span>
                      )}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={-99}
                    max={50}
                    step={1}
                    value={stressPct}
                    onChange={(e) => setStressPct(Number(e.target.value))}
                    className="slider"
                  />
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {[-10, -25, -50, 0].map((p) => (
                      <button
                        key={p}
                        onClick={() => setStressPct(p)}
                        className={`text-[10px] px-2 py-0.5 rounded-md border transition-colors ${
                          stressPct === p ? "border-accent text-accent" : "border-edge text-t2 hover:border-t3"
                        }`}
                      >
                        {p === 0 ? "Reset" : `${p}%`}
                      </button>
                    ))}
                    {rescue && <span className="text-[10px] text-neg ml-auto font-mono">{rescue}</span>}
                  </div>
                </div>
              </>
            )
          )}
        </div>
      </div>

    </div>
  );
}

function Stat({ label, value, next, sub, hidden, accent }: {
  label: string;
  value: string;
  next: string | null;
  sub: string;
  hidden: boolean;
  accent?: "pos" | "neg";
}) {
  const color = accent === "pos" ? "text-pos" : accent === "neg" ? "text-neg" : "text-t1";
  return (
    <div className={`well rounded-xl p-3.5 transition-all ${next && !hidden ? "ring-1 ring-accent-2/50 shadow-[0_0_20px_-8px_rgba(77,200,251,0.4)]" : ""}`}>
      <div className="label mb-1">{label}</div>
      <div className={`font-mono font-bold text-lg tabular ${hidden ? "" : color}`}>
        <CipherValue value={value} hidden={hidden} chars={8} />
        {next && !hidden && <span className="text-accent-2 text-sm"> → {next}</span>}
      </div>
      <div className="text-[11px] text-t2 font-mono">{hidden ? "•••" : sub}</div>
    </div>
  );
}
