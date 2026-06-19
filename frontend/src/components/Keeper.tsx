import { useState } from "react";
import { decodeEventLog } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";

import { useDecryption } from "../context/DecryptionContext";
import { useEncryptedWrite } from "../hooks/useEncryptedWrite";
import { MARKET_ABI } from "../lib/abis";
import type { MarketInfo } from "../lib/config";
import { aprPct, fmt6, parse6 } from "../lib/format";
import { publicDecrypt } from "../lib/fhevm";
import { VerdictTheater, type TheaterState } from "./VerdictTheater";

/**
 * Keeper desk: the only place where anything ever gets decrypted publicly —
 * and it is exactly one bit per health check (liquidatable yes/no) plus pool
 * aggregates for the rate model. Anyone can run these; that is the point.
 */
export function Keeper({ market, prefillTarget }: { market: MarketInfo; prefillTarget?: string }) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const encryptedWrite = useEncryptedWrite(market.address);

  const [target, setTarget] = useState(prefillTarget ?? "");
  const [repayAmount, setRepayAmount] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [liquidatable, setLiquidatable] = useState<boolean | null>(null);
  const [theater, setTheater] = useState<TheaterState>(null);

  // Bidding more than your balance moves 0 AND consumes the flag — guard it.
  const { decrypted, wallet } = useDecryption();
  const debtBalance = decrypted ? (wallet[market.debt.symbol] ?? 0n) : null;
  const repay6 = parse6(repayAmount);
  const overBalance = debtBalance !== null && repay6 !== null && repay6 > debtBalance;

  const append = (line: string) => setLog((prev) => [...prev.slice(-8), line]);

  async function runHealthCheck() {
    if (!publicClient || !target) return;
    setBusy(true);
    setLiquidatable(null);
    try {
      append(`Requesting health check for ${target.slice(0, 10)}…`);
      const hash = await writeContractAsync({
        address: market.address,
        abi: MARKET_ABI,
        functionName: "requestHealthCheck",
        args: [target as `0x${string}`],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      let flagHandle: string | null = null;
      for (const logEntry of receipt.logs) {
        try {
          const parsed = decodeEventLog({ abi: MARKET_ABI, data: logEntry.data, topics: logEntry.topics });
          if (parsed.eventName === "HealthCheckRequested") {
            flagHandle = (parsed.args as { flagHandle: string }).flagHandle;
          }
        } catch {
          // not our event
        }
      }
      if (!flagHandle) throw new Error("flag handle not found in receipt");

      append("Public-decrypting the ONE bit via the relayer…");
      setTheater({ phase: "scanning" });
      const results = await publicDecrypt([flagHandle]);
      const isLiquidatable = results.clearValues[flagHandle as `0x${string}`] as boolean;
      setLiquidatable(isLiquidatable);
      setTheater({ phase: "verdict", liquidatable: isLiquidatable });
      append(`KMS verdict: ${isLiquidatable ? "LIQUIDATABLE" : "healthy"}`);

      append("Submitting KMS proof on-chain…");
      const submitHash = await writeContractAsync({
        address: market.address,
        abi: MARKET_ABI,
        functionName: "submitHealthCheck",
        args: [target as `0x${string}`, results.abiEncodedClearValues, results.decryptionProof],
      });
      await publicClient.waitForTransactionReceipt({ hash: submitHash });
      append("Health check finalized ✓");
    } catch (e) {
      setTheater(null);
      append(`Failed: ${(e as Error).message.slice(0, 140)}`);
    } finally {
      setBusy(false);
    }
  }

  async function liquidate() {
    if (!target || !repay6) return;
    setBusy(true);
    try {
      append("Submitting encrypted liquidation…");
      await encryptedWrite.mutateAsync({ fn: "liquidate", amount6: repay6, target: target as `0x${string}` });
      append("Liquidation confirmed ✓ — seized collateral transferred (amount encrypted)");
    } catch (e) {
      append(`Liquidation failed: ${(e as Error).message.slice(0, 140)}`);
    } finally {
      setBusy(false);
    }
  }

  async function syncRates() {
    if (!publicClient) return;
    setBusy(true);
    try {
      append("Requesting rate sync (pool aggregates disclosure)…");
      const hash = await writeContractAsync({
        address: market.address,
        abi: MARKET_ABI,
        functionName: "requestRateSync",
        args: [],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      let cashHandle: string | null = null;
      let borrowsHandle: string | null = null;
      let collateralHandle: string | null = null;
      for (const logEntry of receipt.logs) {
        try {
          const parsed = decodeEventLog({ abi: MARKET_ABI, data: logEntry.data, topics: logEntry.topics });
          if (parsed.eventName === "RateSyncRequested") {
            const args = parsed.args as { cashHandle: string; borrowsNormHandle: string; collateralHandle: string };
            cashHandle = args.cashHandle;
            borrowsHandle = args.borrowsNormHandle;
            collateralHandle = args.collateralHandle;
          }
        } catch {
          // not our event
        }
      }
      if (!cashHandle || !borrowsHandle || !collateralHandle) throw new Error("handles not found");

      append("Public-decrypting pool aggregates…");
      const results = await publicDecrypt([cashHandle, borrowsHandle, collateralHandle]);

      const submitHash = await writeContractAsync({
        address: market.address,
        abi: MARKET_ABI,
        functionName: "submitRateSync",
        args: [results.abiEncodedClearValues, results.decryptionProof],
      });
      await publicClient.waitForTransactionReceipt({ hash: submitHash });

      const [borrowApr, supplyApr] = await Promise.all([
        publicClient.readContract({ address: market.address, abi: MARKET_ABI, functionName: "borrowApr6" }),
        publicClient.readContract({ address: market.address, abi: MARKET_ABI, functionName: "supplyApr6" }),
      ]);
      append(`Rates updated ✓ borrow ${aprPct(borrowApr)} / supply ${aprPct(supplyApr)}`);
    } catch (e) {
      append(`Rate sync failed: ${(e as Error).message.slice(0, 140)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel p-4">
      <VerdictTheater state={theater} onClose={() => setTheater(null)} />
      <h3 className="font-bold mb-1">Keeper desk — Be the liquidation bot</h3>
      <p className="text-xs text-slate-400 mb-3 leading-relaxed">
        On Aave, bots read everyone's health factor off-chain and snipe liquidations. Here they
        can't — positions are encrypted. Instead, <b className="text-slate-300">anyone</b> can act as a
        keeper: pick an address, ask the KMS to check it, and the network answers with{" "}
        <b className="text-slate-300">one public bit</b> (liquidatable or not) plus a proof. If it's a 1,
        the liquidate button arms. Keepers earn the 5% liquidation bonus; the borrower's amounts stay
        hidden even from the keeper who liquidates them. Rate sync is the same idea for the pool's
        aggregate utilization → interest rates.
      </p>

      <div className="flex flex-wrap gap-2 mb-2">
        <input
          className="input flex-1 min-w-60"
          placeholder="Borrower address (0x…)"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        />
        <button className="btn-ghost" disabled={busy || !address || !target} onClick={runHealthCheck}>
          Run health check
        </button>
        <button className="btn-ghost" disabled={busy || !address} onClick={syncRates}>
          Sync rates
        </button>
      </div>

      {liquidatable && (
        <div className="mb-2">
          <div className="flex gap-2">
            <input
              className="input flex-1"
              placeholder={`Ceiling bid (${market.debt.symbol}) — clamps to 50% of the hidden debt`}
              value={repayAmount}
              onChange={(e) => setRepayAmount(e.target.value)}
            />
            <button className="btn bg-neg text-ink font-bold" disabled={busy || !repay6 || overBalance} onClick={liquidate}>
              Liquidate (encrypted)
            </button>
          </div>
          {debtBalance !== null && (
            <p className="text-[11px] text-slate-500 mt-1 font-mono">
              Your {market.debt.symbol}: {fmt6(debtBalance)} — bid at most this
            </p>
          )}
          {overBalance && (
            <p className="text-neg text-xs mt-1">
              Bid exceeds your balance — the pull would move 0 and burn the flag. Lower the bid.
            </p>
          )}
        </div>
      )}

      {log.length > 0 && (
        <div className="bg-panel-2 rounded-xl p-2 font-mono text-[11px] text-slate-300">
          {log.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}
    </div>
  );
}
