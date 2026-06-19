import { useMutation } from "@tanstack/react-query";
import { bytesToHex } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";

import { MARKET_ABI } from "../lib/abis";
import { getFhevm } from "../lib/fhevm";

type EncryptedFn = "supply" | "withdrawSupply" | "addCollateral" | "withdrawCollateral" | "borrow";

/**
 * Encrypts an amount client-side (with ZK input proof) and submits it to a
 * market function. The chain only ever sees ciphertext.
 */
export function useEncryptedWrite(market: `0x${string}`) {
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  return useMutation({
    mutationFn: async (args: { fn: EncryptedFn | "repay" | "liquidate"; amount6: bigint; target?: `0x${string}` }) => {
      if (!address) throw new Error("Connect a wallet first");
      const fhevm = await getFhevm();

      const input = fhevm.createEncryptedInput(market, address);
      input.add64(args.amount6);
      const encrypted = await input.encrypt();
      const handle = bytesToHex(encrypted.handles[0]);
      const proof = bytesToHex(encrypted.inputProof);

      const hash =
        args.fn === "repay" || args.fn === "liquidate"
          ? await writeContractAsync({
              address: market,
              abi: MARKET_ABI,
              functionName: args.fn,
              args: [args.target ?? address, handle, proof],
            })
          : await writeContractAsync({
              address: market,
              abi: MARKET_ABI,
              functionName: args.fn,
              args: [handle, proof],
            });

      await publicClient!.waitForTransactionReceipt({ hash });
      return hash;
    },
  });
}
