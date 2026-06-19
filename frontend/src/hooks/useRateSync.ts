import { useState } from "react";
import { decodeEventLog } from "viem";
import { usePublicClient, useWriteContract } from "wagmi";

import { MARKET_ABI } from "../lib/abis";
import { publicDecrypt } from "../lib/fhevm";

/**
 * Drives a full rate sync: request (discloses cash, borrows, collateral) ->
 * relayer publicDecrypt -> submit with KMS proof. Permissionless; anyone can
 * refresh a market's public aggregates.
 */
export function useRateSync(market: `0x${string}`) {
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [busy, setBusy] = useState(false);

  async function sync(): Promise<void> {
    if (!publicClient) return;
    setBusy(true);
    try {
      const hash = await writeContractAsync({
        address: market,
        abi: MARKET_ABI,
        functionName: "requestRateSync",
        args: [],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      let handles: [string, string, string] | null = null;
      for (const logEntry of receipt.logs) {
        try {
          const parsed = decodeEventLog({ abi: MARKET_ABI, data: logEntry.data, topics: logEntry.topics });
          if (parsed.eventName === "RateSyncRequested") {
            const a = parsed.args as { cashHandle: string; borrowsNormHandle: string; collateralHandle: string };
            handles = [a.cashHandle, a.borrowsNormHandle, a.collateralHandle];
          }
        } catch {
          // not our event
        }
      }
      if (!handles) throw new Error("rate sync handles not found");

      const results = await publicDecrypt(handles);
      const submitHash = await writeContractAsync({
        address: market,
        abi: MARKET_ABI,
        functionName: "submitRateSync",
        args: [results.abiEncodedClearValues, results.decryptionProof],
      });
      await publicClient.waitForTransactionReceipt({ hash: submitHash });
    } finally {
      setBusy(false);
    }
  }

  return { sync, busy };
}
