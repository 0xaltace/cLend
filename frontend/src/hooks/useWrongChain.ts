import { useAccount, useSwitchChain } from "wagmi";
import { sepolia } from "wagmi/chains";

/**
 * True when a wallet is connected but not on Sepolia. Every on-chain write in
 * cLend targets Sepolia contracts, and reads are pinned to a Sepolia public
 * client, so a wrong-chain wallet can browse the whole app and only fail at the
 * write step. Write actions consume this to block until the user switches.
 */
export function useWrongChain() {
  const { isConnected, chainId } = useAccount();
  const { switchChain, isPending } = useSwitchChain();
  return {
    wrongChain: isConnected && chainId !== sepolia.id,
    switching: isPending,
    switchToSepolia: () => switchChain({ chainId: sepolia.id }),
  };
}
