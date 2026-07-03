import { Link, NavLink } from "react-router-dom";
import { useAccount, useDisconnect, useSwitchChain } from "wagmi";
import { sepolia } from "wagmi/chains";

import { useDecryption } from "../context/DecryptionContext";
import { useTheme } from "../context/ThemeContext";
import { shortAddr } from "../lib/format";
import { IconDrop, IconEye, IconEyeOff, IconGrid, IconMoon, IconPie, IconScale, IconSun } from "./Icons";
import { Logo } from "./Logo";
import { useWalletModal } from "./WalletModal";

const TABS = [
  { to: "/app", label: "Markets", Icon: IconGrid },
  { to: "/portfolio", label: "Portfolio", Icon: IconPie },
  { to: "/liquidations", label: "Liquidations", Icon: IconScale },
  { to: "/faucet", label: "Faucet", Icon: IconDrop },
];

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button className="btn-icon" onClick={toggle} title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
      {theme === "dark" ? <IconSun size={16} /> : <IconMoon size={16} />}
    </button>
  );
}

export function Nav() {
  const { address, chainId, isConnected } = useAccount();
  const { open } = useWalletModal();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const { decrypted, publicView, setPublicView } = useDecryption();

  const wrongChain = isConnected && chainId !== sepolia.id;

  const tab = ({ isActive }: { isActive: boolean }) =>
    `px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-all duration-150 ${
      isActive ? "text-accent bg-accent/10" : "text-t2 hover:text-t1 hover:bg-well"
    }`;

  const mobileTab = ({ isActive }: { isActive: boolean }) =>
    `flex flex-col items-center gap-1 py-2 flex-1 text-[10px] font-semibold transition-colors ${
      isActive ? "text-accent" : "text-t3"
    }`;

  return (
    <>
      <header className="sticky top-0 z-40 backdrop-blur-xl border-b border-edge" style={{ background: "var(--overlay)" }}>
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
          <Link to="/" className="shrink-0">
            <Logo size={32} />
          </Link>

          <nav className="hidden md:flex items-center gap-1 rounded-xl border border-edge bg-well p-1">
            {TABS.map((t) => (
              <NavLink key={t.to} to={t.to} className={tab}>
                {t.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            {decrypted && (
              <button
                onClick={() => setPublicView(!publicView)}
                className={`btn-icon ${publicView ? "!text-accent-2 !border-accent-2/40" : ""}`}
                title={publicView ? "Chain view — showing what the public sees" : "Your view — decrypted locally. Click to see the chain view."}
              >
                {publicView ? <IconEyeOff size={16} /> : <IconEye size={16} />}
              </button>
            )}
            <ThemeToggle />
            {wrongChain && (
              <button className="btn-danger text-xs" onClick={() => switchChain({ chainId: sepolia.id })}>
                Switch network
              </button>
            )}
            {isConnected ? (
              <button className="btn-ghost font-mono text-xs flex items-center gap-2" onClick={() => disconnect()} title="Disconnect">
                <span className="w-1.5 h-1.5 rounded-full bg-pos" />
                {shortAddr(address!)}
              </button>
            ) : (
              <button className="btn-primary text-xs" onClick={open}>
                Connect
              </button>
            )}
          </div>
        </div>
      </header>

      {/* mobile bottom tab bar */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-edge backdrop-blur-xl flex"
        style={{ background: "var(--overlay)", paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} className={mobileTab}>
            <t.Icon size={18} />
            {t.label}
          </NavLink>
        ))}
      </nav>
    </>
  );
}
