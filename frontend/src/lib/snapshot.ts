import { useReadContracts } from "wagmi";

import { MARKET_ABI, ORACLE_ABI } from "./abis";
import { ADDRESSES, MARKETS, WAD6, type MarketInfo } from "./config";

/** Aggregates a market disclosed at its last rate sync (public, "as of sync"). */
export interface MarketSnapshot {
  cash: bigint; // debt-token units (1e6)
  borrows: bigint; // debt-token units (1e6)
  collateral: bigint; // collateral-token units (1e6)
  utilization6: bigint;
  syncedAt: number; // unix seconds (0 = never synced)
  collatPrice8: bigint | null;
  debtPrice8: bigint | null;
}

export interface MarketTvl {
  suppliedUsd: number; // cash + borrows, valued in debt asset
  collateralUsd: number;
  borrowsUsd: number;
  totalUsd: number; // supplied + collateral
}

export function tvlOf(s: MarketSnapshot): MarketTvl | null {
  if (s.debtPrice8 === null || s.collatPrice8 === null) return null;
  const dp = Number(s.debtPrice8) / 1e8;
  const cp = Number(s.collatPrice8) / 1e8;
  const supplied = (Number(s.cash + s.borrows) / 1e6) * dp;
  const borrows = (Number(s.borrows) / 1e6) * dp;
  const collateral = (Number(s.collateral) / 1e6) * cp;
  return { suppliedUsd: supplied, borrowsUsd: borrows, collateralUsd: collateral, totalUsd: supplied + collateral };
}

/** Reads every market's snapshot + prices in one multicall batch. */
export function useAllSnapshots(): { snapshots: Map<string, MarketSnapshot>; isLoading: boolean } {
  const contracts = MARKETS.flatMap((m) => [
    { address: m.address, abi: MARKET_ABI, functionName: "marketSnapshot" } as const,
    { address: ADDRESSES.oracle as `0x${string}`, abi: ORACLE_ABI, functionName: "priceUsd8", args: [m.collateral.cToken] } as const,
    { address: ADDRESSES.oracle as `0x${string}`, abi: ORACLE_ABI, functionName: "priceUsd8", args: [m.debt.cToken] } as const,
  ]);

  const { data, isLoading } = useReadContracts({ contracts, query: { refetchInterval: 30_000 } });

  const snapshots = new Map<string, MarketSnapshot>();
  if (data) {
    MARKETS.forEach((m, i) => {
      const snap = data[i * 3]?.result as readonly [bigint, bigint, bigint, bigint, bigint] | undefined;
      const collatPrice = data[i * 3 + 1]?.result as bigint | undefined;
      const debtPrice = data[i * 3 + 2]?.result as bigint | undefined;
      if (snap) {
        snapshots.set(m.address, {
          cash: snap[0],
          borrows: snap[1],
          collateral: snap[2],
          utilization6: snap[3],
          syncedAt: Number(snap[4]),
          collatPrice8: collatPrice ?? null,
          debtPrice8: debtPrice ?? null,
        });
      }
    });
  }
  return { snapshots, isLoading };
}

export function useGlobalTvl(): { totalUsd: number; suppliedUsd: number; borrowsUsd: number; collateralUsd: number } {
  const { snapshots } = useAllSnapshots();
  let totalUsd = 0;
  let suppliedUsd = 0;
  let borrowsUsd = 0;
  let collateralUsd = 0;
  for (const s of snapshots.values()) {
    const t = tvlOf(s);
    if (t) {
      totalUsd += t.totalUsd;
      suppliedUsd += t.suppliedUsd;
      borrowsUsd += t.borrowsUsd;
      collateralUsd += t.collateralUsd;
    }
  }
  return { totalUsd, suppliedUsd, borrowsUsd, collateralUsd };
}

/** Available borrow liquidity (debt-token units) as of last sync. */
export function availableLiquidity(s: MarketSnapshot | undefined): bigint | null {
  if (!s || s.syncedAt === 0) return null;
  return s.cash;
}

export interface SyncStatus {
  syncedAt: number;
  ageSeconds: number;
  isStale: boolean; // older than display threshold
  never: boolean;
}

const STALE_DISPLAY_SECONDS = 30 * 60; // 30 min: flag the UI as stale (separate from the 24h on-chain gate)

export function syncStatus(s: MarketSnapshot | undefined, nowSec: number): SyncStatus {
  if (!s || s.syncedAt === 0) return { syncedAt: 0, ageSeconds: 0, isStale: true, never: true };
  const age = Math.max(0, nowSec - s.syncedAt);
  return { syncedAt: s.syncedAt, ageSeconds: age, isStale: age > STALE_DISPLAY_SECONDS, never: false };
}

export function ageLabel(seconds: number): string {
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function usd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

export type { MarketInfo };
export { WAD6 };
