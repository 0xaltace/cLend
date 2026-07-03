import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { bytesToHex, decodeEventLog, formatUnits } from "viem";
import { useAccount, usePublicClient, useReadContract, useReadContracts, useWriteContract } from "wagmi";

import { useDecryption } from "../context/DecryptionContext";
import { MINTABLE_ERC20_ABI, WRAPPER_ABI } from "../lib/abis";
import { ASSETS, type AssetInfo } from "../lib/config";
import { getFhevm, publicDecrypt } from "../lib/fhevm";
import { fmt6, parse6, toInputString } from "../lib/format";
import { CipherValue } from "./viz/CipherValue";

/** Turn noisy wallet/RPC errors into one clean human line. */
function cleanError(e: unknown): string {
  const err = e as { shortMessage?: string; message?: string };
  const raw = err.shortMessage || err.message || String(e);
  if (/user rejected|rejected the request|user denied|action_rejected/i.test(raw)) return "cancelled in wallet";
  if (/insufficient funds/i.test(raw)) return "insufficient ETH for gas";
  // drop viem's "Request Arguments:" / "Details:" / stack tails
  return raw.split(/Request Arguments:|Details:|Contract Call:|\n/)[0].trim().slice(0, 90);
}

/**
 * Faucet for the OFFICIAL registry cTokenMocks. Two paths per asset:
 *  - Mint + wrap: mint the underlying mock, approve, wrap (3 transactions).
 *  - Wrap existing: you already hold unwrapped underlying (e.g. a cancelled
 *    flow) — approve + wrap what's in the wallet (2 transactions).
 */
export function Faucet() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { refreshAfterTx } = useDecryption();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  /** Snap all on-chain reads (unwrapped balances) and re-decrypt confidential ones. */
  const refreshBalances = (confidential: boolean) => {
    void queryClient.invalidateQueries();
    if (confidential) void refreshAfterTx();
  };

  // Single transient status line (no running log). Terminal messages auto-clear.
  const append = (line: string) => {
    setStatus(line);
    if (/✓|cancelled|insufficient|failed|only hold|no unwrapped/i.test(line)) {
      setTimeout(() => setStatus((cur) => (cur === line ? null : cur)), 5000);
    }
  };

  /**
   * Sets an ERC-20 allowance safely. USDT-style tokens revert on a non-zero ->
   * non-zero approve, so reset to 0 first; and skip entirely when the existing
   * allowance already covers `needed` (saves a tx and avoids the revert).
   */
  async function ensureAllowance(underlying: `0x${string}`, spender: `0x${string}`, needed: bigint) {
    const current = (await publicClient!.readContract({
      address: underlying,
      abi: MINTABLE_ERC20_ABI,
      functionName: "allowance",
      args: [address!, spender],
    })) as bigint;
    if (current >= needed) return;
    if (current > 0n) {
      const reset = await writeContractAsync({
        address: underlying,
        abi: MINTABLE_ERC20_ABI,
        functionName: "approve",
        args: [spender, 0n],
      });
      await publicClient!.waitForTransactionReceipt({ hash: reset });
    }
    const hash = await writeContractAsync({
      address: underlying,
      abi: MINTABLE_ERC20_ABI,
      functionName: "approve",
      args: [spender, needed],
    });
    await publicClient!.waitForTransactionReceipt({ hash });
  }

  async function mintAndWrap(symbol: string, amountText: string) {
    const asset = ASSETS[symbol];
    const amount6 = parse6(amountText);
    if (!address || !publicClient || !asset || !amount6) return;

    setBusy(symbol);
    try {
      const underlying = (await publicClient.readContract({
        address: asset.cToken,
        abi: WRAPPER_ABI,
        functionName: "underlying",
      })) as `0x${string}`;
      const rate = (await publicClient.readContract({
        address: asset.cToken,
        abi: WRAPPER_ABI,
        functionName: "rate",
      })) as bigint;
      const underlyingAmount = amount6 * rate;

      append(`${symbol}: minting underlying mock…`);
      let hash = await writeContractAsync({
        address: underlying,
        abi: MINTABLE_ERC20_ABI,
        functionName: "mint",
        args: [address, underlyingAmount],
      });
      await publicClient.waitForTransactionReceipt({ hash });

      append(`${symbol}: approving wrapper…`);
      await ensureAllowance(underlying, asset.cToken, underlyingAmount);

      append(`${symbol}: wrapping into confidential token…`);
      hash = await writeContractAsync({
        address: asset.cToken,
        abi: WRAPPER_ABI,
        functionName: "wrap",
        args: [address, underlyingAmount],
      });
      await publicClient.waitForTransactionReceipt({ hash });

      refreshBalances(true);
      append(`${symbol}: done ✓ — balance is now encrypted on-chain`);
    } catch (e) {
      append(`${symbol}: ${cleanError(e)}`);
    } finally {
      setBusy(null);
    }
  }

  async function mintOnly(symbol: string, amountText: string) {
    const asset = ASSETS[symbol];
    const amount6 = parse6(amountText);
    if (!address || !publicClient || !asset || !amount6) return;

    setBusy(symbol);
    try {
      const underlying = (await publicClient.readContract({
        address: asset.cToken,
        abi: WRAPPER_ABI,
        functionName: "underlying",
      })) as `0x${string}`;
      const rate = (await publicClient.readContract({
        address: asset.cToken,
        abi: WRAPPER_ABI,
        functionName: "rate",
      })) as bigint;

      append(`${symbol}: minting ${amountText} underlying…`);
      const hash = await writeContractAsync({
        address: underlying,
        abi: MINTABLE_ERC20_ABI,
        functionName: "mint",
        args: [address, amount6 * rate],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      refreshBalances(false);
      append(`${symbol}: minted ${amountText} ✓ (public ERC-20 — wrap it to make it confidential)`);
    } catch (e) {
      append(`${symbol}: ${cleanError(e)}`);
    } finally {
      setBusy(null);
    }
  }

  async function wrapExisting(symbol: string, amountText: string) {
    const asset = ASSETS[symbol];
    const amount6 = parse6(amountText);
    if (!address || !publicClient || !asset || !amount6) return;

    setBusy(symbol);
    try {
      const underlying = (await publicClient.readContract({
        address: asset.cToken,
        abi: WRAPPER_ABI,
        functionName: "underlying",
      })) as `0x${string}`;
      const rate = (await publicClient.readContract({
        address: asset.cToken,
        abi: WRAPPER_ABI,
        functionName: "rate",
      })) as bigint;
      const balance = (await publicClient.readContract({
        address: underlying,
        abi: MINTABLE_ERC20_ABI,
        functionName: "balanceOf",
        args: [address],
      })) as bigint;

      const requested = amount6 * rate;
      if (balance === 0n) {
        append(`${symbol}: no unwrapped balance to wrap`);
        return;
      }
      if (requested > balance) {
        append(`${symbol}: you only hold ${formatUnits(balance, Number(rate.toString().length - 1) + 6)} unwrapped — lower the amount`);
        return;
      }

      append(`${symbol}: approving wrapper for ${amountText}…`);
      await ensureAllowance(underlying, asset.cToken, requested);

      append(`${symbol}: wrapping ${amountText}…`);
      const hash = await writeContractAsync({
        address: asset.cToken,
        abi: WRAPPER_ABI,
        functionName: "wrap",
        args: [address, requested],
      });
      await publicClient.waitForTransactionReceipt({ hash });

      refreshBalances(true);
      append(`${symbol}: wrapped ${amountText} ✓ — now encrypted ERC-7984`);
    } catch (e) {
      append(`${symbol}: ${cleanError(e)}`);
    } finally {
      setBusy(null);
    }
  }

  /**
   * Two-step unwrap (ERC-7984 -> ERC-20): encrypt the amount and call unwrap
   * (burns + makes the burned amount publicly decryptable), then publicDecrypt
   * the request handle and finalize to release the underlying.
   */
  async function unwrap(symbol: string, amountText: string) {
    const asset = ASSETS[symbol];
    const amount6 = parse6(amountText);
    if (!address || !publicClient || !asset || !amount6) return;

    setBusy(symbol);
    try {
      const fhevm = await getFhevm();
      const input = fhevm.createEncryptedInput(asset.cToken, address);
      input.add64(amount6);
      const enc = await input.encrypt();

      append(`${symbol}: unwrapping ${amountText} (burning confidential)…`);
      const hash = await writeContractAsync({
        address: asset.cToken,
        abi: WRAPPER_ABI,
        functionName: "unwrap",
        args: [address, address, bytesToHex(enc.handles[0]), bytesToHex(enc.inputProof)],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      let requestId: string | null = null;
      for (const logEntry of receipt.logs) {
        try {
          const parsed = decodeEventLog({ abi: WRAPPER_ABI, data: logEntry.data, topics: logEntry.topics });
          if (parsed.eventName === "UnwrapRequested") {
            requestId = (parsed.args as { unwrapRequestId: string }).unwrapRequestId;
          }
        } catch {
          // not our event
        }
      }
      if (!requestId) throw new Error("unwrap request id not found");

      append(`${symbol}: decrypting burned amount via relayer…`);
      const results = await publicDecrypt([requestId]);
      const cleartext = results.clearValues[requestId as `0x${string}`] as bigint;

      append(`${symbol}: finalizing unwrap…`);
      const finalizeHash = await writeContractAsync({
        address: asset.cToken,
        abi: WRAPPER_ABI,
        functionName: "finalizeUnwrap",
        args: [requestId as `0x${string}`, cleartext, results.decryptionProof],
      });
      await publicClient.waitForTransactionReceipt({ hash: finalizeHash });
      refreshBalances(true);
      append(`${symbol}: unwrapped ✓ — underlying ERC-20 returned to your wallet`);
    } catch (e) {
      append(`${symbol}: unwrap ${cleanError(e)}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="panel p-5">
      <div className="grid md:grid-cols-3 gap-3">
        {Object.values(ASSETS).map((asset) => (
          <FaucetRow
            key={asset.symbol}
            asset={asset}
            busy={busy === asset.symbol}
            disabled={busy !== null || !address}
            onMint={(amt) => mintAndWrap(asset.symbol, amt)}
            onMintOnly={(amt) => mintOnly(asset.symbol, amt)}
            onWrapExisting={(amt) => wrapExisting(asset.symbol, amt)}
            onUnwrap={(amt) => unwrap(asset.symbol, amt)}
          />
        ))}
      </div>

      {status && (
        <div className="mt-3 text-[11px] text-t2 font-mono flex items-center gap-2">
          {busy && <span className="inline-block w-2 h-2 rounded-full bg-accent animate-pulse" />}
          {status}
        </div>
      )}
    </div>
  );
}

function FaucetRow({ asset, busy, disabled, onMint, onMintOnly, onWrapExisting, onUnwrap }: {
  asset: AssetInfo;
  busy: boolean;
  disabled: boolean;
  onMint: (amount: string) => void;
  onMintOnly: (amount: string) => void;
  onWrapExisting: (amount: string) => void;
  onUnwrap: (amount: string) => void;
}) {
  const { address } = useAccount();
  const [amount, setAmount] = useState(asset.symbol === "cWETH" ? "1" : "1000");

  const { data: underlying } = useReadContract({
    address: asset.cToken,
    abi: WRAPPER_ABI,
    functionName: "underlying",
  });

  const { data: reads } = useReadContracts({
    contracts: underlying
      ? [
          { address: underlying as `0x${string}`, abi: MINTABLE_ERC20_ABI, functionName: "balanceOf", args: [address!] },
          { address: underlying as `0x${string}`, abi: MINTABLE_ERC20_ABI, functionName: "decimals" },
        ]
      : [],
    query: { enabled: !!underlying && !!address, refetchInterval: 20_000 },
  });
  const rawBalance = (reads?.[0]?.result as bigint | undefined) ?? 0n;
  const decimals = (reads?.[1]?.result as number | undefined) ?? 18;
  const unwrapped = Number(formatUnits(rawBalance, decimals));

  // Wrapped (confidential ERC-7984) balance comes from the decryption context;
  // it renders as ciphertext in chain view and a real number in your view.
  const { decrypted, publicView, wallet } = useDecryption();
  const wrappedHidden = !decrypted || publicView;
  const wrapped6 = wallet[asset.symbol] ?? 0n;

  return (
    <div className="well rounded-xl p-3.5">
      <div className="flex items-center gap-2 mb-2.5">
        <span className="w-7 h-7 rounded-full grid place-items-center text-xs font-bold text-accent-2 bg-gradient-to-br from-accent-2/20 to-accent-2/[0.03] border border-accent-2/25">
          {asset.logo}
        </span>
        <div className="font-bold text-sm">{asset.symbol}</div>
        {asset.postedFeed && <span className="text-accent text-[10px] ml-auto" title="Posted feed">◆</span>}
      </div>
      <div className="flex items-center justify-between text-[10px] font-mono mb-2 gap-2">
        {/* Wrapped: clickable to fill the input (Unwrap), but only when revealed */}
        <button
          className={`text-left ${wrappedHidden ? "cursor-default" : "hover:text-accent-2"}`}
          disabled={wrappedHidden}
          title={wrappedHidden ? "Decrypt to reveal & use" : "Click to fill amount"}
          onClick={() => {
            if (wrappedHidden) return; // hidden ciphertext: do nothing (avoids filling garbage)
            setAmount(toInputString(wrapped6));
          }}
        >
          <span className="text-t3">Wrapped: </span>
          {wrappedHidden ? (
            <CipherValue value="" hidden chars={6} className="text-[10px]" />
          ) : (
            <span className={wrapped6 > 0n ? "text-pos" : "text-t2"}>{fmt6(wrapped6)}</span>
          )}
        </button>
        {/* Unwrapped: always public; clickable to fill the input (Wrap) */}
        <button
          className="text-right hover:text-accent"
          title="Click to fill amount"
          onClick={() => setAmount(unwrapped > 0 ? String(unwrapped) : amount)}
        >
          <span className="text-t3">Unwrapped: </span>
          <span className={unwrapped > 0 ? "text-accent" : "text-t2"}>
            {unwrapped.toLocaleString(undefined, { maximumFractionDigits: 4 })}
          </span>
        </button>
      </div>
      <input className="input mb-2" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <div className="grid grid-cols-3 gap-1.5 mb-1.5">
        <button className="btn-ghost text-xs" disabled={disabled} onClick={() => onMintOnly(amount)}>
          Mint
        </button>
        <button
          className="btn-ghost text-xs"
          disabled={disabled || rawBalance === 0n}
          title={rawBalance === 0n ? "No unwrapped balance — mint first" : "Wrap from your unwrapped balance"}
          onClick={() => onWrapExisting(amount)}
        >
          Wrap
        </button>
        <button
          className="btn-ghost text-xs"
          disabled={disabled}
          title="Unwrap confidential token back to underlying ERC-20"
          onClick={() => onUnwrap(amount)}
        >
          Unwrap
        </button>
      </div>
      <button className="btn-primary w-full" disabled={disabled} onClick={() => onMint(amount)}>
        {busy ? "Working…" : "Mint + wrap"}
      </button>
    </div>
  );
}
