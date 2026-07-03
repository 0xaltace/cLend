import { Link } from "react-router-dom";

import { ADDRESSES, MARKETS } from "../lib/config";
import { Logo } from "./Logo";

const ES = "https://sepolia.etherscan.io/address";

export function Footer() {
  return (
    <footer className="relative mt-20 border-t border-edge">
      <div className="max-w-6xl mx-auto px-4 py-12 grid md:grid-cols-[1.4fr_1fr_1fr_1fr] gap-8">
        <div>
          <Logo withTag />
          <p className="text-[11px] text-t3 mt-4 leading-relaxed max-w-60">
            The first fully encrypted lending platform. Collateral, debt and health factors are stored
            on-chain as FHE ciphertext, while the protocol still enforces solvency.
          </p>
          <div className="flex gap-1.5 mt-4">
            <span className="tag bg-accent-2/[0.07] text-accent-2 border border-accent-2/20">Sepolia</span>
            <span className="tag bg-pos/[0.07] text-pos border border-pos/20">ERC-7984</span>
            <span className="tag bg-accent/[0.07] text-accent border border-accent/20">Zama FHEVM</span>
          </div>
        </div>

        <FooterCol
          title="Protocol"
          links={[
            { label: "Markets", to: "/app" },
            { label: "Portfolio", to: "/portfolio" },
            { label: "Liquidations", to: "/liquidations" },
            { label: "Faucet", to: "/faucet" },
          ]}
        />
        <FooterCol
          title="Contracts"
          links={[
            { label: "Factory", href: `${ES}/${ADDRESSES.factory}#code` },
            { label: "Price Oracle", href: `${ES}/${ADDRESSES.oracle}#code` },
            { label: "cWETH → cUSDC market", href: `${ES}/${MARKETS[0].address}#code` },
            { label: "Wrappers Registry", href: `${ES}/${ADDRESSES.registry}` },
          ]}
        />
        <FooterCol
          title="Ecosystem"
          links={[
            { label: "Zama Protocol docs", href: "https://docs.zama.org/protocol" },
            { label: "Developer Program", href: "https://www.zama.org/programs/developer-program" },
            { label: "ERC-7984 standard", href: "https://docs.zama.org/protocol/examples/openzeppelin-confidential-contracts/erc7984" },
            { label: "Chainlink feeds", href: "https://docs.chain.link/data-feeds" },
          ]}
        />
      </div>
      <div className="border-t border-edge/60">
        <div className="max-w-6xl mx-auto px-4 py-4 flex flex-wrap justify-between gap-2 text-[10px] text-t3">
          <span>© 2026 cLend — Confidential lending on the Zama Protocol</span>
          <span>Sepolia testnet · Zama Developer Program Season 3</span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: {
  title: string;
  links: Array<{ label: string; to?: string; href?: string }>;
}) {
  return (
    <div>
      <div className="label mb-3.5">{title}</div>
      <ul className="space-y-2.5 text-xs">
        {links.map((l) => (
          <li key={l.label}>
            {l.to ? (
              <Link to={l.to} className="text-t2 hover:text-accent transition-colors">
                {l.label}
              </Link>
            ) : (
              <a href={l.href} target="_blank" rel="noreferrer" className="text-t2 hover:text-accent transition-colors">
                {l.label} <span className="text-t3">↗</span>
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
