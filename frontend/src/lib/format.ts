import { WAD6 } from "./config";

/** Format a 6-decimal token amount for display. */
export function fmt6(amount: bigint, maxFraction = 4): string {
  const whole = amount / WAD6;
  const frac = amount % WAD6;
  if (frac === 0n) return whole.toLocaleString();
  const fracStr = frac.toString().padStart(6, "0").slice(0, maxFraction).replace(/0+$/, "");
  return fracStr ? `${whole.toLocaleString()}.${fracStr}` : whole.toLocaleString();
}

/** Parse a user-typed decimal into 6-decimal units. Returns null when invalid. */
export function parse6(text: string): bigint | null {
  const trimmed = text.trim();
  if (!/^\d+(\.\d{0,6})?$/.test(trimmed)) return null;
  const [whole, frac = ""] = trimmed.split(".");
  return BigInt(whole) * WAD6 + BigInt(frac.padEnd(6, "0") || "0");
}

/** 6-decimal bigint -> plain input string ("1234.5678", no grouping). */
export function toInputString(v: bigint): string {
  const whole = v / WAD6;
  const frac = (v % WAD6).toString().padStart(6, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

/** 1e6-scale annual rate to percent string. Tiny non-zero rates show as <0.01%
 *  so low-utilization markets don't look like they pay nothing. */
export function aprPct(apr6: bigint | number): string {
  const pct = Number(apr6) / 10_000;
  if (pct === 0) return "0%";
  if (pct > 0 && pct < 0.01) return "<0.01%";
  return `${pct.toFixed(2)}%`;
}

/** 1e8-scale USD price to display string. */
export function priceUsd(price8: bigint): string {
  return `$${(Number(price8) / 1e8).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
