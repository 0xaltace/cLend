import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { parseAbiItem } from "viem";
import { usePublicClient } from "wagmi";

import { useRateSync } from "../hooks/useRateSync";
import { MARKETS, type MarketInfo } from "../lib/config";
import { safeGetLogs } from "../lib/logs";
import { ageLabel, syncStatus, tvlOf, usd, useGlobalTvl, type MarketSnapshot } from "../lib/snapshot";

const PARTICIPANT_EVENTS = [
  parseAbiItem("event Supplied(address indexed user)"),
  parseAbiItem("event Borrowed(address indexed user)"),
  parseAbiItem("event CollateralAdded(address indexed user)"),
];

function useNowSec() {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/** Global protocol TVL banner for the Markets page. */
export function TvlBanner() {
  const { totalUsd, suppliedUsd, borrowsUsd, collateralUsd } = useGlobalTvl();
  return (
    <div className="panel relative overflow-hidden p-5 flex flex-wrap items-center justify-between gap-5">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(600px_140px_at_12%_0%,rgba(247,201,72,0.07),transparent)]" />
      <div className="relative">
        <div className="label">Total value locked</div>
        <div className="font-mono font-bold text-3xl tabular mt-0.5">{totalUsd > 0 ? usd(totalUsd) : "—"}</div>
        <div className="text-[10px] text-t3 mt-0.5">Supplied + collateral, as of each market's last sync</div>
      </div>
      <div className="relative flex flex-wrap gap-x-6 gap-y-2 text-sm font-mono">
        <Metric label="Supplied" value={usd(suppliedUsd)} color="text-pos" />
        <Metric label="Outstanding borrows" value={usd(borrowsUsd)} color="text-accent" />
        <Metric label="Collateral locked" value={usd(collateralUsd)} color="text-accent-2" />
      </div>
    </div>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="text-right">
      <div className="label">{label}</div>
      <div className={`font-bold tabular mt-0.5 ${color}`}>{value}</div>
    </div>
  );
}

/** Per-market TVL line. */
export function MarketTvl({ snap }: { snap: MarketSnapshot | undefined }) {
  const t = snap ? tvlOf(snap) : null;
  if (!t) return null;
  return (
    <div className="flex gap-4 text-[11px] font-mono text-t2">
      <span>TVL <span className="text-t1">{usd(t.totalUsd)}</span></span>
      <span>Supplied <span className="text-pos">{usd(t.suppliedUsd)}</span></span>
      <span>Borrows <span className="text-accent">{usd(t.borrowsUsd)}</span></span>
      <span>Collateral <span className="text-accent-2">{usd(t.collateralUsd)}</span></span>
    </div>
  );
}

/** Last-sync freshness + permissionless "Sync now". */
export function SyncBadge({ market, snap }: { market: MarketInfo; snap: MarketSnapshot | undefined }) {
  const now = useNowSec();
  const st = syncStatus(snap, now);
  const { sync, busy } = useRateSync(market.address);

  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className={st.never ? "text-accent" : st.isStale ? "text-accent" : "text-t3"}>
        {st.never ? "Never synced" : `Synced ${ageLabel(st.ageSeconds)}`}
        {st.isStale && !st.never && " · stale"}
      </span>
      <button
        className="text-accent-2 hover:text-accent font-semibold disabled:opacity-50 rounded-md px-2 py-0.5 border border-accent-2/20 hover:border-accent/40 transition-colors"
        disabled={busy}
        onClick={() => sync().catch(() => {})}
      >
        {busy ? "syncing…" : "Sync now"}
      </button>
    </div>
  );
}

/** "Few known participants" warning derived from historical events. */
export function LowAnonymityBadge({ market }: { market: MarketInfo }) {
  const publicClient = usePublicClient();
  const { data: count } = useQuery({
    queryKey: ["participants", market.address],
    refetchInterval: 60_000,
    enabled: !!publicClient,
    queryFn: async () => {
      const logs = await safeGetLogs(publicClient!, {
        address: market.address,
        events: PARTICIPANT_EVENTS,
        fallbackLookback: 300n,
      });
      const set = new Set<string>();
      for (const l of logs) {
        const u = (l.args as unknown as { user?: string }).user;
        if (u) set.add(u.toLowerCase());
      }
      return set.size;
    },
  });

  if (count === undefined || count >= 3) return null;
  return (
    <span
      className="tag bg-accent/10 text-accent border border-accent/30"
      title="With few known participants, disclosed aggregates can approximate an individual position. Individual positions remain encrypted."
    >
      Few known participants
    </span>
  );
}

export { MARKETS };
