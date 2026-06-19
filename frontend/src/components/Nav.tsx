import { Link, NavLink } from "react-router-dom";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { sepolia } from "wagmi/chains";

import { useDecryption } from "../context/DecryptionContext";
import { shortAddr } from "../lib/format";
import { Logo } from "./Logo";

export function Nav() {
  const { address, chainId, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const { decrypted, publicView, setPublicView } = useDecryption();

  const wrongChain = isConnected && chainId !== sepolia.id;

  const tab = ({ isActive }: { isActive: boolean }) =>
    `px-3.5 py-1.5 rounded-xl text-sm font-semibold transition-colors ${
      isActive ? "bg-accent text-ink" : "text-slate-300 hover:bg-panel-2"
    }`;

  return (
    <header className="sticky top-0 z-40 backdrop-blur-md bg-ink/80 border-b border-line">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
        <Link to="/" className="shrink-0">
          <Logo size={30} />
        </Link>

        <nav className="flex items-center gap-1">
          <NavLink to="/app" className={tab}>
            Markets
          </NavLink>
          <NavLink to="/portfolio" className={tab}>
            Portfolio
          </NavLink>
          <NavLink to="/liquidations" className={tab}>
            Liquidations
          </NavLink>
          <NavLink to="/faucet" className={tab}>
            Faucet
          </NavLink>
        </nav>

        <div className="flex items-center gap-2">
          {decrypted && (
            <button
              onClick={() => setPublicView(!publicView)}
              className={`btn text-xs px-3 py-1.5 border ${
                publicView
                  ? "bg-accent-2/10 border-accent-2/40 text-accent-2"
                  : "bg-panel-2 border-line text-slate-300"
              }`}
              title="Toggle between your decrypted view and what the public chain sees"
            >
              {publicView ? "🔒 Chain view" : "🔓 Your view"}
            </button>
          )}
          {wrongChain && (
            <button className="btn bg-neg text-ink text-xs" onClick={() => switchChain({ chainId: sepolia.id })}>
              Switch network
            </button>
          )}
          {isConnected ? (
            <button className="btn-ghost font-mono text-xs" onClick={() => disconnect()}>
              {shortAddr(address!)}
            </button>
          ) : (
            <button className="btn-primary text-xs" disabled={isPending} onClick={() => connect({ connector: connectors[0] })}>
              {isPending ? "Connecting…" : "Connect"}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
