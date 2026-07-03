import { useMutation } from "@tanstack/react-query";
import { bytesToHex } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";

import { MARKET_ABI, WRAPPER_ABI } from "../lib/abis";
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
    mutationFn: async (args: {
      fn: EncryptedFn | "repay" | "liquidate";
      amount6: bigint;
      target?: `0x${string}`;
      /** cToken whose wallet balance this action moves — used to wait until reads reflect the tx. */
      watchToken?: `0x${string}`;
    }) => {
      if (!address) throw new Error("Connect a wallet first");
      const fhevm = await getFhevm();

      // ERC-7984 writes a new balance handle on every transfer, so a changed
      // handle is proof the RPC we read from has caught up to this tx.
      const readBalanceHandle = () =>
        publicClient!.readContract({
          address: args.watchToken!,
          abi: WRAPPER_ABI,
          functionName: "confidentialBalanceOf",
          args: [address],
        });
      const handleBefore = args.watchToken ? await readBalanceHandle() : null;

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

      // Public fallback RPCs can still serve pre-tx state right after the
      // receipt; wait (bounded) until the balance handle moves before the
      // caller re-reads and re-decrypts everything.
      if (handleBefore !== null) {
        for (let i = 0; i < 5; i++) {
          if ((await readBalanceHandle()) !== handleBefore) break;
          await new Promise((r) => setTimeout(r, 2_000));
        }
      }
      return hash;
    },
  });
}
