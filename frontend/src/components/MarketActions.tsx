import { useEffect, useRef, useState } from "react";
import { useAccount, useReadContract, useWriteContract } from "wagmi";

import { useDecryption } from "../context/DecryptionContext";
import { useEncryptedWrite } from "../hooks/useEncryptedWrite";
import { WRAPPER_ABI } from "../lib/abis";
import { OPERATOR_TTL_SECONDS, type MarketInfo } from "../lib/config";
import { fmt6, parse6, toInputString } from "../lib/format";
import { computePosition } from "../lib/positionMath";
import { availableLiquidity, useAllSnapshots } from "../lib/snapshot";

type Action = "supply" | "withdrawSupply" | "addCollateral" | "withdrawCollateral" | "borrow" | "repay";

const ACTIONS: Array<{ id: Action; label: string; token: "debt" | "collateral" | "shares"; needsOperator: "debt" | "collateral" | null; blurb: string }> = [
  { id: "supply", label: "Supply", token: "debt", needsOperator: "debt", blurb: "Lend the debt asset, earn encrypted interest-bearing shares." },
  { id: "withdrawSupply", label: "Withdraw", token: "shares", needsOperator: null, blurb: "Redeem shares for underlying, clamped to pool liquidity." },
  { id: "addCollateral", label: "Add collateral", token: "collateral", needsOperator: "collateral", blurb: "Deposit encrypted collateral. Nobody can see how much." },
  { id: "withdrawCollateral", label: "Remove collateral", token: "collateral", needsOperator: null, blurb: "Withdraws up to your safe maximum — over-asks clamp silently." },
  { id: "borrow", label: "Borrow", token: "debt", needsOperator: null, blurb: "Borrow against collateral. Your borrow power stays encrypted." },
  { id: "repay", label: "Repay", token: "debt", needsOperator: "debt", blurb: "Repay debt. Overpayment clamps to what you owe." },
];

const GROUPS: Record<"borrow" | "earn", Action[]> = {
  borrow: ["addCollateral", "withdrawCollateral", "borrow", "repay"],
  earn: ["supply", "withdrawSupply"],
};

export function MarketActions({ market, onDone, onPreview, group }: {
  market: MarketInfo;
  onDone: () => void;
  onPreview?: (preview: { fn: Action; amount6: bigint } | null) => void;
  /** Show only one side's actions; omit for all six. */
  group?: "borrow" | "earn";
}) {
  const { address } = useAccount();
  const visibleActions = group ? ACTIONS.filter((a) => GROUPS[group].includes(a.id)) : ACTIONS;
  const [action, setAction] = useState<Action>(group === "borrow" ? "addCollateral" : "supply");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  function updatePreview(nextAction: Action, nextAmount: string) {
    const amount6 = parse6(nextAmount);
    onPreview?.(amount6 && amount6 > 0n ? { fn: nextAction, amount6 } : null);
  }

  const encryptedWrite = useEncryptedWrite(market.address);
  const { writeContractAsync } = useWriteContract();
  const { snapshots } = useAllSnapshots();

  const spec = ACTIONS.find((a) => a.id === action)!;
  const operatorToken = spec.needsOperator === "debt" ? market.debt.cToken : market.collateral.cToken;

  const { data: isOperator, refetch: refetchOperator } = useReadContract({
    address: operatorToken,
    abi: WRAPPER_ABI,
    functionName: "isOperator",
    args: address ? [address, market.address] : undefined,
    query: { enabled: !!address && spec.needsOperator !== null },
  });

  const needsApproval = spec.needsOperator !== null && isOperator === false;
  const amount6 = parse6(amount);

  const { decrypted, wallet, positions, decryptAll } = useDecryption();
  const position = positions.find((p) => p.market.address === market.address);
  const view = position ? computePosition(position) : null;
  const snap = snapshots.get(market.address);
  const poolLiquidity = availableLiquidity(snap); // debt-token units, or null

  // Borrow power in debt-token units = remaining USD power / debt price.
  const borrowPower6: bigint | null =
    decrypted && view && view.debtUsd !== undefined
      ? BigInt(Math.floor((view.borrowPowerLeftUsd / (Number(position!.debtPrice8) / 1e8)) * 1e6))
      : null;
  // Effective borrow ceiling: min(power, pool liquidity).
  const borrowMax6: bigint | null =
    action === "borrow"
      ? borrowPower6 !== null && poolLiquidity !== null
        ? borrowPower6 < poolLiquidity
          ? borrowPower6
          : poolLiquidity
        : (borrowPower6 ?? poolLiquidity)
      : null;

  // Balance guard for the non-borrow actions (clamp-to-zero footgun on the wallet side).
  const available: bigint | null = !decrypted
    ? null
    : action === "supply" || action === "repay"
      ? (wallet[market.debt.symbol] ?? 0n)
      : action === "addCollateral"
        ? (wallet[market.collateral.symbol] ?? 0n)
        : action === "withdrawSupply"
          ? (position?.shares ?? 0n)
          : action === "withdrawCollateral"
            ? (position?.collat ?? 0n)
            : null;

  const insufficient = available !== null && amount6 !== null && amount6 > available;
  const overBorrow = action === "borrow" && borrowMax6 !== null && amount6 !== null && amount6 > borrowMax6;
  const blocked = insufficient || overBorrow;

  const balanceLabel =
    action === "withdrawSupply" ? "Your shares" : action === "withdrawCollateral" ? "Your collateral" : "Wallet balance";

  // ---- actual-fill report: diff the decrypted position after a clamping action ----
  const pendingFill = useRef<{ fn: Action; requested: bigint; before: bigint } | null>(null);

  function fillTracked(a: Action): boolean {
    return a === "borrow" || a === "withdrawSupply" || a === "repay" || a === "withdrawCollateral";
  }
  function fillBefore(a: Action): bigint {
    if (a === "borrow" || a === "withdrawSupply" || a === "repay") return wallet[market.debt.symbol] ?? 0n;
    return wallet[market.collateral.symbol] ?? 0n; // withdrawCollateral
  }

  useEffect(() => {
    const p = pendingFill.current;
    if (!p) return;
    const after = p.fn === "withdrawCollateral" ? (wallet[market.collateral.symbol] ?? 0n) : (wallet[market.debt.symbol] ?? 0n);
    const filled = p.fn === "repay" ? p.before - after : after - p.before;
    if (filled !== p.before) {
      const sym = p.fn === "withdrawCollateral" ? market.collateral.symbol : market.debt.symbol;
      if (filled < (p.requested * 99n) / 100n) {
        const reason = p.fn === "borrow" ? "borrow power or pool liquidity" : "your position or pool liquidity";
        setStatus(`Requested ${fmt6(p.requested)} → filled ${fmt6(filled < 0n ? 0n : filled)} ${sym} (limited by ${reason})`);
      } else {
        setStatus(`Confirmed ✓ — filled ${fmt6(filled)} ${sym}, encrypted on-chain`);
      }
      pendingFill.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet, positions]);

  async function approveOperator() {
    setStatus("Approving market as operator…");
    try {
      await writeContractAsync({
        address: operatorToken,
        abi: WRAPPER_ABI,
        functionName: "setOperator",
        args: [market.address, Math.floor(Date.now() / 1000) + OPERATOR_TTL_SECONDS],
      });
      setStatus("Operator approved. You can submit now.");
      setTimeout(() => refetchOperator(), 3_000);
    } catch (e) {
      setStatus(`Approval failed: ${(e as Error).message.slice(0, 120)}`);
    }
  }

  async function submit() {
    if (!amount6 || amount6 <= 0n || blocked) return;
    const trackFill = decrypted && fillTracked(action);
    if (trackFill) pendingFill.current = { fn: action, requested: amount6, before: fillBefore(action) };
    setStatus("Encrypting amount locally…");
    try {
      await encryptedWrite.mutateAsync(
        { fn: action, amount6 },
        { onSuccess: () => setStatus(trackFill ? "Confirmed ✓ — reading actual fill…" : "Confirmed ✓ — amount stayed encrypted on-chain") },
      );
      setAmount("");
      onPreview?.(null);
      if (decrypted) await decryptAll();
      onDone();
    } catch (e) {
      pendingFill.current = null;
      setStatus(`Failed: ${(e as Error).message.slice(0, 160)}`);
    }
  }

  const inputToken = spec.token === "shares" ? "shares" : spec.token === "debt" ? market.debt.symbol : market.collateral.symbol;
  const maxFill = action === "borrow" ? borrowMax6 : available;

  return (
    <div className={group ? "" : "panel p-4"}>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {visibleActions.map((a) => (
          <button
            key={a.id}
            onClick={() => {
              setAction(a.id);
              setStatus(null);
              updatePreview(a.id, amount);
            }}
            className={`btn text-xs px-3 py-1.5 ${action === a.id ? "bg-accent text-ink" : "bg-panel-2 border border-line"}`}
          >
            {a.label}
          </button>
        ))}
      </div>

      <p className="text-xs text-slate-400 mb-3">{spec.blurb}</p>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            className="input pr-14"
            placeholder={`Amount (${inputToken})`}
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              updatePreview(action, e.target.value);
            }}
          />
          {maxFill !== null && maxFill > 0n && (
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-accent-2 hover:text-accent transition-colors"
              onClick={() => {
                // borrow: leave 1% headroom so price drift between read and tx can't zero it
                const m = action === "borrow" ? (maxFill * 99n) / 100n : maxFill;
                const v = toInputString(m);
                setAmount(v);
                updatePreview(action, v);
              }}
            >
              MAX
            </button>
          )}
        </div>
        {needsApproval ? (
          <button className="btn-ghost whitespace-nowrap" onClick={approveOperator}>
            1. Approve operator
          </button>
        ) : (
          <button
            className="btn-primary whitespace-nowrap"
            disabled={!address || !amount6 || encryptedWrite.isPending || blocked}
            onClick={submit}
          >
            {encryptedWrite.isPending ? "Submitting…" : "Submit"}
          </button>
        )}
      </div>

      {/* limits / captions */}
      {action === "borrow" && decrypted && (
        <div className="text-[11px] text-slate-500 mt-1.5 font-mono space-y-0.5">
          {borrowPower6 !== null && <div>Borrow power: {fmt6(borrowPower6)} {market.debt.symbol}</div>}
          {poolLiquidity !== null ? (
            <div>Pool liquidity: ~{fmt6(poolLiquidity)} {market.debt.symbol} (as of last sync)</div>
          ) : (
            <div className="text-amber-400/80">Pool liquidity unknown — run a rate sync to enable borrowing</div>
          )}
        </div>
      )}
      {available !== null && action !== "borrow" && (
        <p className="text-[11px] text-slate-500 mt-1.5 font-mono">
          {balanceLabel}: {fmt6(available)}{" "}
          {action === "withdrawCollateral" && <span className="text-slate-600">(LTV may clamp lower)</span>}
        </p>
      )}
      {decrypted === false && (
        <p className="text-[11px] text-slate-500 mt-1.5">Decrypt your portfolio to enable limit checks and MAX</p>
      )}

      {/* hard blocks */}
      {overBorrow && (
        <p className="text-neg text-xs mt-2">
          Exceeds your {borrowMax6 === poolLiquidity ? "available pool liquidity" : "borrow power"} of{" "}
          {fmt6(borrowMax6!)} {market.debt.symbol}. Lower the amount — the transaction is blocked so it
          can't partial-fill or waste gas.
        </p>
      )}
      {insufficient && (
        <p className="text-neg text-xs mt-2">
          Exceeds your balance of {fmt6(available!)} — lower the amount.
        </p>
      )}
      {amount && amount6 === null && <p className="text-neg text-xs mt-2">Invalid amount (max 6 decimals)</p>}
      {status && <p className="text-xs mt-2 text-slate-300">{status}</p>}
    </div>
  );
}
