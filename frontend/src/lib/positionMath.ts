import type { MarketPosition } from "../context/DecryptionContext";

export const LTV = 0.75;
export const LLTV = 0.8;

export interface PositionView {
  collatAmount: number;
  debtAmount: number;
  suppliedAmount: number;
  collatUsd: number;
  debtUsd: number;
  suppliedUsd: number;
  healthFactor: number | null; // null = no debt
  maxBorrowUsd: number;
  liqThresholdUsd: number;
  /** Collateral price at which the position becomes liquidatable. */
  liqPrice: number | null;
  collatPrice: number;
  borrowPowerLeftUsd: number;
}

export function computePosition(p: MarketPosition): PositionView {
  const collatAmount = Number(p.collat) / 1e6;
  const debtAmount = Number(p.debt) / 1e6;
  const suppliedAmount = Number(p.supplied) / 1e6;
  const collatPrice = Number(p.collatPrice8) / 1e8;
  const debtPrice = Number(p.debtPrice8) / 1e8;

  const collatUsd = collatAmount * collatPrice;
  const debtUsd = debtAmount * debtPrice;
  const suppliedUsd = suppliedAmount * debtPrice;

  const healthFactor = debtUsd > 0 ? (collatUsd * LLTV) / debtUsd : null;
  const maxBorrowUsd = collatUsd * LTV;
  const liqThresholdUsd = collatUsd * LLTV;
  const liqPrice = debtUsd > 0 && collatAmount > 0 ? debtUsd / (collatAmount * LLTV) : null;

  return {
    collatAmount,
    debtAmount,
    suppliedAmount,
    collatUsd,
    debtUsd,
    suppliedUsd,
    healthFactor,
    maxBorrowUsd,
    liqThresholdUsd,
    liqPrice,
    collatPrice,
    borrowPowerLeftUsd: Math.max(0, maxBorrowUsd - debtUsd),
  };
}

export type PreviewAction =
  | "supply"
  | "withdrawSupply"
  | "addCollateral"
  | "withdrawCollateral"
  | "borrow"
  | "repay";

/** Apply a hypothetical action to a position — drives the live typing preview. */
export function projectPosition(p: MarketPosition, fn: PreviewAction, amount6: bigint): MarketPosition {
  const next = { ...p };
  const min = (a: bigint, b: bigint) => (a < b ? a : b);
  switch (fn) {
    case "supply":
      next.supplied = p.supplied + amount6;
      break;
    case "withdrawSupply":
      next.supplied = p.supplied - min(amount6, p.supplied);
      break;
    case "addCollateral":
      next.collat = p.collat + amount6;
      break;
    case "withdrawCollateral":
      next.collat = p.collat - min(amount6, p.collat);
      break;
    case "borrow":
      next.debt = p.debt + amount6;
      break;
    case "repay":
      next.debt = p.debt - min(amount6, p.debt);
      break;
  }
  return next;
}

/** Invert the kinked curve: live utilization from the public borrow APR. */
export function utilizationFromApr6(borrowApr6: bigint): number {
  const apr = Number(borrowApr6) / 1e6;
  const KINK = 0.8;
  const SLOPE1 = 0.04;
  const SLOPE2 = 0.6;
  if (apr <= 0) return 0;
  if (apr <= SLOPE1) return (apr / SLOPE1) * KINK * 1e6;
  return (KINK + ((apr - SLOPE1) / SLOPE2) * (1 - KINK)) * 1e6;
}
