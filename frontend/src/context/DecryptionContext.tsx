/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAccount, usePublicClient, useSignTypedData } from "wagmi";

import { MARKET_ABI, ORACLE_ABI, WRAPPER_ABI } from "../lib/abis";
import { ADDRESSES, ASSETS, MARKETS, WAD6, type MarketInfo } from "../lib/config";
import { getDecryptionSession, hasCachedSession, userDecryptBatch } from "../lib/fhevm";

export interface MarketPosition {
  market: MarketInfo;
  collat: bigint; // collateral token units (6 dec)
  debt: bigint; // current debt in debt token units (6 dec)
  shares: bigint; // supply shares (6 dec)
  supplied: bigint; // shares valued at supplyIndex (debt token units)
  collatPrice8: bigint;
  debtPrice8: bigint;
  borrowApr6: bigint;
  supplyApr6: bigint;
}

interface DecryptionState {
  /** Privacy lens: true = render ciphertext (public view), false = decrypted view. */
  publicView: boolean;
  setPublicView: (v: boolean) => void;
  decrypted: boolean;
  busy: boolean;
  error: string | null;
  wallet: Record<string, bigint>;
  positions: MarketPosition[];
  decryptAll: () => Promise<void>;
  reset: () => void;
}

const Ctx = createContext<DecryptionState | null>(null);

export function DecryptionProvider({ children }: { children: ReactNode }) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { signTypedDataAsync } = useSignTypedData();

  const [publicView, setPublicView] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wallet, setWallet] = useState<Record<string, bigint>>({});
  const [positions, setPositions] = useState<MarketPosition[]>([]);
  const [decrypted, setDecrypted] = useState(false);

  const decryptAll = useCallback(async () => {
    if (!address || !publicClient) return;
    setBusy(true);
    setError(null);
    try {
      const assetList = Object.values(ASSETS);
      // The relayer SDK caps a decryption session at 10 contracts, so wallet
      // tokens and markets get their own cached sessions (one signature each
      // per 24h).
      const sign = (args: unknown) => signTypedDataAsync(args as Parameters<typeof signTypedDataAsync>[0]);
      const tokensSession = await getDecryptionSession(
        "tokens",
        address,
        assetList.map((a) => a.cToken as string),
        sign,
      );
      const marketsSession = await getDecryptionSession(
        "markets",
        address,
        MARKETS.map((m) => m.address as string),
        sign,
      );

      const walletHandles = await Promise.all(
        assetList.map((a) =>
          publicClient.readContract({
            address: a.cToken,
            abi: WRAPPER_ABI,
            functionName: "confidentialBalanceOf",
            args: [address],
          }),
        ),
      );

      const marketReads = await Promise.all(
        MARKETS.map(async (m) => {
          const [position, shares, borrowIndex, supplyIndex, borrowApr, supplyApr, collatPrice, debtPrice] =
            await Promise.all([
              publicClient.readContract({ address: m.address, abi: MARKET_ABI, functionName: "positionOf", args: [address] }),
              publicClient.readContract({ address: m.address, abi: MARKET_ABI, functionName: "confidentialBalanceOf", args: [address] }),
              publicClient.readContract({ address: m.address, abi: MARKET_ABI, functionName: "borrowIndex6" }),
              publicClient.readContract({ address: m.address, abi: MARKET_ABI, functionName: "supplyIndex6" }),
              publicClient.readContract({ address: m.address, abi: MARKET_ABI, functionName: "borrowApr6" }),
              publicClient.readContract({ address: m.address, abi: MARKET_ABI, functionName: "supplyApr6" }),
              publicClient.readContract({ address: ADDRESSES.oracle as `0x${string}`, abi: ORACLE_ABI, functionName: "priceUsd8", args: [m.collateral.cToken] }),
              publicClient.readContract({ address: ADDRESSES.oracle as `0x${string}`, abi: ORACLE_ABI, functionName: "priceUsd8", args: [m.debt.cToken] }),
            ]);
          return { m, collatHandle: position[0], debtNormHandle: position[1], sharesHandle: shares, borrowIndex, supplyIndex, borrowApr, supplyApr, collatPrice, debtPrice };
        }),
      );

      const walletPairs = walletHandles.map((handle, i) => ({
        handle: handle as string,
        contractAddress: assetList[i].cToken as string,
      }));
      const marketPairs = marketReads.flatMap((r) => [
        { handle: r.collatHandle as string, contractAddress: r.m.address as string },
        { handle: r.debtNormHandle as string, contractAddress: r.m.address as string },
        { handle: r.sharesHandle as string, contractAddress: r.m.address as string },
      ]);
      const [walletValues, marketValues] = await Promise.all([
        userDecryptBatch(tokensSession, walletPairs),
        userDecryptBatch(marketsSession, marketPairs),
      ]);

      const newWallet: Record<string, bigint> = {};
      assetList.forEach((a, i) => {
        newWallet[a.symbol] = walletValues[i];
      });

      const newPositions: MarketPosition[] = marketReads.map((r, i) => {
        const base = i * 3;
        const debtNorm = marketValues[base + 1];
        const shares = marketValues[base + 2];
        return {
          market: r.m,
          collat: marketValues[base],
          debt: (debtNorm * r.borrowIndex) / WAD6,
          shares,
          supplied: (shares * r.supplyIndex) / WAD6,
          collatPrice8: r.collatPrice as bigint,
          debtPrice8: r.debtPrice as bigint,
          borrowApr6: BigInt(r.borrowApr),
          supplyApr6: BigInt(r.supplyApr),
        };
      });

      setWallet(newWallet);
      setPositions(newPositions);
      setDecrypted(true);
      setPublicView(false);
    } catch (e) {
      setError((e as Error).message.slice(0, 200));
    } finally {
      setBusy(false);
    }
  }, [address, publicClient, signTypedDataAsync]);

  const reset = useCallback(() => {
    setWallet({});
    setPositions([]);
    setDecrypted(false);
  }, []);

  // Auto-decrypt on arrival when BOTH cached sessions are valid: no wallet
  // prompt, and the meters get to play their 0 -> value sweep on every visit.
  const autoRan = useRef(false);
  useEffect(() => {
    if (!address || !publicClient || autoRan.current || decrypted || busy) return;
    const tokensOk = hasCachedSession(
      "tokens",
      address,
      Object.values(ASSETS).map((a) => a.cToken as string),
    );
    const marketsOk = hasCachedSession(
      "markets",
      address,
      MARKETS.map((m) => m.address as string),
    );
    if (tokensOk && marketsOk) {
      autoRan.current = true;
      void decryptAll();
    }
  }, [address, publicClient, decrypted, busy, decryptAll]);

  const value = useMemo(
    () => ({ publicView, setPublicView, decrypted, busy, error, wallet, positions, decryptAll, reset }),
    [publicView, decrypted, busy, error, wallet, positions, decryptAll, reset],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDecryption(): DecryptionState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useDecryption outside provider");
  return ctx;
}
