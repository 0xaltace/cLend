import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useAccount, usePublicClient } from "wagmi";

import type { AbiEvent } from "viem";

import { MARKET_ABI } from "../lib/abis";
import { MARKETS } from "../lib/config";
import { shortAddr } from "../lib/format";
import { safeGetLogs } from "../lib/logs";
import { CipherValue } from "./viz/CipherValue";

const MARKET_EVENTS = MARKET_ABI.filter((e) => e.type === "event") as unknown as AbiEvent[];

const EVENT_VERBS: Record<string, { verb: string; color: string }> = {
  Supplied: { verb: "supplied", color: "text-pos" },
  SupplyWithdrawn: { verb: "withdrew supply", color: "text-slate-300" },
  CollateralAdded: { verb: "added collateral", color: "text-accent-2" },
  CollateralWithdrawn: { verb: "removed collateral", color: "text-slate-300" },
  Borrowed: { verb: "borrowed", color: "text-accent" },
  Repaid: { verb: "repaid", color: "text-pos" },
  Liquidated: { verb: "was liquidated", color: "text-neg" },
  HealthCheckResolved: { verb: "health check", color: "text-slate-400" },
  RatesUpdated: { verb: "rates synced", color: "text-slate-400" },
};

/**
 * 100% real on-chain events — and not a single amount among them, because the
 * protocol's events genuinely contain none. The ciphertext blocks aren't a
 * style choice; they're the actual information content of the chain.
 */
export function ActivityFeed() {
  const publicClient = usePublicClient();
  const { address } = useAccount();
  const [mineOnly, setMineOnly] = useState(false);

  const { data: items } = useQuery({
    queryKey: ["activity"],
    refetchInterval: 30_000,
    enabled: !!publicClient,
    queryFn: async () => {
      const logs = await safeGetLogs(publicClient!, {
        address: MARKETS.map((m) => m.address),
        events: MARKET_EVENTS,
      });
      return [...logs]
        .sort((a, b) => Number((b.blockNumber ?? 0n) - (a.blockNumber ?? 0n)))
        .filter((l) => l.eventName && EVENT_VERBS[l.eventName])
        .map((l) => {
          const market = MARKETS.find((m) => m.address.toLowerCase() === l.address.toLowerCase());
          const args = l.args as Record<string, unknown>;
          const actor = (args.user ?? args.payer ?? args.liquidator ?? "") as string;
          return {
            id: `${l.transactionHash}-${l.logIndex}`,
            event: l.eventName as string,
            actor,
            market: market ? `${market.collateral.symbol}→${market.debt.symbol}` : "",
            tx: l.transactionHash,
          };
        });
    },
  });

  const filtered = (items ?? [])
    .filter((it) => !mineOnly || (address && it.actor.toLowerCase() === address.toLowerCase()))
    .slice(0, 9);

  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] uppercase tracking-wider text-slate-400">Live on-chain activity</div>
        <div className="flex items-center gap-2">
          {address && (
            <button
              onClick={() => setMineOnly((v) => !v)}
              className={`text-[10px] font-bold px-2 py-0.5 rounded-md border transition-colors ${
                mineOnly ? "border-accent text-accent" : "border-line text-slate-400 hover:border-slate-500"
              }`}
            >
              Mine
            </button>
          )}
          <span className="tag bg-accent-2/10 text-accent-2">Amounts: encrypted, always</span>
        </div>
      </div>
      <div className="space-y-1">
        {filtered.map((item) => {
          const spec = EVENT_VERBS[item.event];
          return (
            <a
              key={item.id}
              href={`https://sepolia.etherscan.io/tx/${item.tx}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 text-xs font-mono bg-panel-2/60 hover:bg-panel-2 rounded-lg px-2.5 py-1.5 transition-colors"
            >
              <span className="text-slate-500">{item.actor ? shortAddr(item.actor) : "—"}</span>
              <span className={spec.color}>{spec.verb}</span>
              <CipherValue value="" hidden chars={8} className="text-[10px]" />
              <span className="text-slate-600 ml-auto">{item.market}</span>
            </a>
          );
        })}
        {filtered.length === 0 && (
          <div className="text-xs text-slate-500 py-2">
            {mineOnly ? "No activity from your address in the scanned window." : "No recent activity in the scanned window."}
          </div>
        )}
      </div>
    </div>
  );
}
