import { useWrongChain } from "../hooks/useWrongChain";

/**
 * Inline "switch to Sepolia" prompt rendered next to a write action when the
 * wallet is on the wrong network. Renders nothing on Sepolia, so it is safe to
 * drop next to any on-chain write button.
 */
export function WrongChainNotice({ className = "" }: { className?: string }) {
  const { wrongChain, switching, switchToSepolia } = useWrongChain();
  if (!wrongChain) return null;
  return (
    <div className={`flex flex-wrap items-center gap-2 text-[11px] text-neg mt-2 ${className}`}>
      <span>Wrong network — cLend runs on Sepolia.</span>
      <button className="btn-primary text-[11px] px-2.5 py-1" disabled={switching} onClick={switchToSepolia}>
        {switching ? "Switching…" : "Switch to Sepolia"}
      </button>
    </div>
  );
}
