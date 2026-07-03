import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { IconCheck, IconEye, IconShield, IconTarget } from "../components/Icons";
import { Logo } from "../components/Logo";
import { ThemeToggle } from "../components/Nav";
import { CipherRain } from "../components/viz/CipherRain";
import { CipherValue } from "../components/viz/CipherValue";
import { RateCurve } from "../components/viz/RateCurve";
import { useGlobalTvl, usd } from "../lib/snapshot";

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.55 },
};

export function Landing() {
  return (
    <>
      <LandingHeader />
      <div className="relative overflow-hidden">
        <CipherRain
          className="[mask-image:radial-gradient(ellipse_75%_65%_at_50%_20%,black_10%,transparent_72%)]"
          opacity={0.5}
        />
        <div className="relative max-w-6xl mx-auto px-4">
          <Hero />
          <StatsStrip />
        </div>
      </div>
      <div className="max-w-6xl mx-auto px-4">
        <Problem />
        <HowItWorks />
        <Comparison />
        <Architecture />
        <FinalCta />
      </div>
    </>
  );
}

function LandingHeader() {
  return (
    <header className="sticky top-0 z-40 backdrop-blur-xl border-b border-edge" style={{ background: "var(--overlay)" }}>
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
        <Logo withTag />
        <nav className="hidden md:flex items-center gap-7 text-sm text-t2">
          <a href="#how" className="hover:text-t1 transition-colors">
            How it works
          </a>
          <a href="#compare" className="hover:text-t1 transition-colors">
            Compare
          </a>
          <a href="#architecture" className="hover:text-t1 transition-colors">
            Architecture
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link to="/app" className="btn-primary">
            Launch App
          </Link>
        </div>
      </div>
    </header>
  );
}

function StatsStrip() {
  const { totalUsd } = useGlobalTvl();
  const stats = [
    { label: "Isolated markets", value: "7", cipher: false },
    { label: "Registry assets", value: "7", cipher: false },
    { label: "Total value locked", value: totalUsd > 0 ? usd(totalUsd) : "—", cipher: false },
    { label: "Largest position", value: "", cipher: true },
  ];
  return (
    <motion.div {...fadeUp} className="panel grid grid-cols-2 md:grid-cols-4 divide-x divide-edge mb-6 overflow-hidden">
      {stats.map((s) => (
        <div key={s.label} className="p-5 text-center">
          <div className="font-mono font-bold text-xl md:text-2xl tabular">
            {s.cipher ? <CipherValue value="" hidden chars={8} /> : s.value}
          </div>
          <div className="label mt-1.5">{s.label}</div>
        </div>
      ))}
    </motion.div>
  );
}

function Hero() {
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setRevealed((r) => !r), 3400);
    return () => clearInterval(t);
  }, []);

  return (
    <section className="pt-16 md:pt-24 pb-14 grid lg:grid-cols-2 gap-10 lg:gap-12 items-center">
      <div>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/[0.06] px-3 py-1 mb-6"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
          <span className="text-[11px] font-semibold tracking-wide text-accent">Live on Sepolia · Zama FHEVM</span>
        </motion.div>

        <motion.h1
          className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.04] tracking-[-0.03em]"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          Lend. Borrow.
          <br />
          <span className="text-gradient-gold">Reveal nothing.</span>
        </motion.h1>
        <motion.p
          className="text-t2 mt-6 max-w-md leading-relaxed text-[15px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25, duration: 0.6 }}
        >
          Collateral, debt and health factor live on-chain as FHE ciphertext. The protocol enforces
          solvency without ever seeing your numbers.
        </motion.p>
        <motion.div
          className="flex flex-wrap gap-3 mt-9"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.45 }}
        >
          <Link to="/app" className="btn-primary text-base px-7 py-3">
            Explore the dApp
          </Link>
          <a href="#how" className="btn-ghost text-base px-7 py-3">
            How it works
          </a>
        </motion.div>
        <motion.div
          className="flex flex-wrap gap-x-5 gap-y-1.5 mt-8 text-[11px] text-t3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          {["Official registry assets", "Chainlink oracles", "Verified on Etherscan"].map((t) => (
            <span key={t} className="flex items-center gap-1.5">
              <IconCheck size={12} className="text-pos" /> {t}
            </span>
          ))}
        </motion.div>
      </div>

      {/* The duality demo — always dark, like a real terminal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.3, duration: 0.6 }}
        data-theme="dark"
        className="card-glow scanline relative overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-edge">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-neg/60" />
            <span className="w-2.5 h-2.5 rounded-full bg-accent/60" />
            <span className="w-2.5 h-2.5 rounded-full bg-pos/60" />
            <span className="text-[10px] font-mono text-t3 ml-2">position_0x4f…e2.enc</span>
          </div>
          <span className={`tag border ${revealed ? "bg-pos/10 text-pos border-pos/25" : "bg-accent-2/10 text-accent-2 border-accent-2/25"}`}>
            {revealed ? "your key" : "ciphertext"}
          </span>
        </div>

        <div className="p-5">
          <div className="label mb-4">{revealed ? "What you see — decrypted locally" : "What the chain sees"}</div>
          <div className="space-y-2.5 font-mono text-sm">
            <DemoRow label="Collateral" clear="12.5 cWETH" hidden={!revealed} />
            <DemoRow label="Debt" clear="9,420 cUSDC" hidden={!revealed} />
            <DemoRow label="Health factor" clear="1.74 — SAFE" hidden={!revealed} />
            <DemoRow label="Liquidation price" clear="$1,254 / ETH" hidden={!revealed} />
          </div>
          <div className="mt-4 text-[11px] text-t3">
            The ciphertext is all that bots, copy-traders and competitors can ever see.
          </div>
        </div>
      </motion.div>
    </section>
  );
}

function DemoRow({ label, clear, hidden }: { label: string; clear: string; hidden: boolean }) {
  return (
    <div className="flex justify-between items-center well rounded-lg px-3.5 py-2.5">
      <span className="text-t2 text-xs">{label}</span>
      <CipherValue value={clear} hidden={hidden} chars={14} className="font-bold" />
    </div>
  );
}

function Problem() {
  const cards = [
    {
      Icon: IconTarget,
      title: "Liquidation prices are public",
      body: "On Aave and Morpho, bots track every health factor and snipe positions the moment they cross 1.0.",
    },
    {
      Icon: IconEye,
      title: "Strategies are copyable",
      body: "Position sizes broadcast your conviction. Anyone can watch and mirror your leverage in real time.",
    },
    {
      Icon: IconShield,
      title: "Institutions need privacy",
      body: "No fund can run a book where every counterparty sees its collateral and margin live.",
    },
  ];
  return (
    <motion.section {...fadeUp} className="py-14">
      <div className="label text-accent mb-2">The problem</div>
      <h2 className="text-2xl md:text-3xl font-bold mb-8">DeFi lending has a surveillance problem</h2>
      <div className="grid md:grid-cols-3 gap-4">
        {cards.map((c) => (
          <div key={c.title} className="panel panel-hover p-6">
            <div className="w-10 h-10 rounded-xl well grid place-items-center text-accent mb-4">
              <c.Icon size={19} />
            </div>
            <div className="font-bold mb-1.5">{c.title}</div>
            <p className="text-xs text-t2 leading-relaxed">{c.body}</p>
          </div>
        ))}
      </div>
    </motion.section>
  );
}

function HowItWorks() {
  const steps = [
    {
      n: "01",
      title: "Encrypt in your browser",
      body: "Amounts are encrypted client-side with a ZK proof. The chain and the mempool only ever carry ciphertext.",
    },
    {
      n: "02",
      title: "FHE math on-chain",
      body: "Borrow limits, interest and solvency are computed directly on encrypted values — over-asks clamp silently.",
    },
    {
      n: "03",
      title: "One public bit",
      body: "For liquidations, the KMS decrypts exactly one boolean: liquidatable or not. Sizes stay sealed.",
    },
  ];
  return (
    <motion.section {...fadeUp} className="py-14 scroll-mt-20" id="how">
      <div className="label text-accent mb-2">The mechanism</div>
      <h2 className="text-2xl md:text-3xl font-bold mb-8">How it works</h2>
      <div className="grid md:grid-cols-3 gap-4">
        {steps.map((s) => (
          <div key={s.n} className="panel panel-hover p-6 relative overflow-hidden">
            <div className="font-mono text-accent-2/30 font-bold text-4xl absolute right-4 top-3 select-none">{s.n}</div>
            <div className="font-bold mb-1.5 mt-1 pr-12">{s.title}</div>
            <p className="text-xs text-t2 leading-relaxed">{s.body}</p>
          </div>
        ))}
      </div>
      <div className="panel p-6 mt-4 flex flex-wrap items-center gap-8">
        <div>
          <div className="font-bold text-sm mb-1.5">Algorithmic rates, no rate oracle</div>
          <p className="text-xs text-t2 max-w-sm leading-relaxed">
            Pool aggregates disclosed at rate syncs drive an Aave-style kinked curve. Individual positions
            never leave ciphertext.
          </p>
        </div>
        <div className="max-w-full overflow-x-auto">
          <RateCurve utilization6={500_000} />
        </div>
      </div>
    </motion.section>
  );
}

function Comparison({ id = "compare" }: { id?: string }) {
  const rows: Array<[string, string, string, string]> = [
    ["Balances", "Public", "Public", "Encrypted"],
    ["Collateral & debt", "Public", "Public", "Encrypted"],
    ["Health factor", "Public", "Public", "1-bit verdict on demand"],
    ["Liquidation price", "Computable by anyone", "Computable by anyone", "Only you"],
    ["Asset listing", "Governance vote", "Permissionless", "Permissionless, registry-gated"],
    ["Risk isolation", "Shared pool", "Isolated markets", "Isolated markets"],
  ];
  return (
    <motion.section {...fadeUp} className="py-14 scroll-mt-20" id={id}>
      <div className="label text-accent mb-2">Side by side</div>
      <h2 className="text-2xl md:text-3xl font-bold mb-8">Compared to Aave and Morpho</h2>
      <div className="panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[560px]">
            <thead>
              <tr className="border-b border-edge text-t2">
                <th className="text-left p-4 font-semibold"></th>
                <th className="text-left p-4 font-semibold">Aave</th>
                <th className="text-left p-4 font-semibold">Morpho</th>
                <th className="text-left p-4 font-semibold">
                  <span className="inline-flex items-center gap-1.5 text-accent">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                    cLend
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([k, a, m, c]) => (
                <tr key={k} className="border-b border-edge/50 last:border-0">
                  <td className="p-4 font-bold text-t1">{k}</td>
                  <td className="p-4 text-t3">{a}</td>
                  <td className="p-4 text-t3">{m}</td>
                  <td className="p-4 text-pos font-semibold bg-accent/[0.04]">{c}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </motion.section>
  );
}

function Architecture() {
  return (
    <motion.section {...fadeUp} className="py-14 scroll-mt-20" id="architecture">
      <div className="label text-accent mb-2">Under the hood</div>
      <h2 className="text-2xl md:text-3xl font-bold mb-8">Registry-native by construction</h2>
      <div className="panel p-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center text-xs font-mono">
          {[
            { t: "Wrappers Registry", d: "Official ERC-20 ↔ ERC-7984 pairs", c: "text-accent-2" },
            { t: "Factory", d: "Permissionless, registry-gated markets", c: "text-accent" },
            { t: "Markets ×7", d: "Isolated FHE lending pairs", c: "text-pos" },
            { t: "Chainlink", d: "Price feeds, staleness-checked", c: "text-t1" },
          ].map((b, i) => (
            <div key={b.t} className="relative">
              <div className="well p-4 h-full">
                <div className={`font-bold ${b.c}`}>{b.t}</div>
                <div className="text-t3 mt-1.5">{b.d}</div>
              </div>
              {i < 3 && (
                <div className="hidden md:block absolute top-1/2 -right-3 -translate-y-1/2 text-accent/60 font-bold z-10">→</div>
              )}
            </div>
          ))}
        </div>
        <p className="text-xs text-t2 mt-5 leading-relaxed max-w-3xl">
          cLend never mints its own tokens — all seven markets use official registry wrappers, re-validated
          on-chain at creation. Anyone can list the next registry pair straight from the factory.
        </p>
      </div>
    </motion.section>
  );
}

function FinalCta() {
  return (
    <motion.section {...fadeUp} className="py-16 md:py-20">
      <div data-theme="dark" className="card-glow relative overflow-hidden p-8 md:p-12 text-center">
        <CipherRain
          className="[mask-image:radial-gradient(ellipse_70%_100%_at_50%_50%,black_20%,transparent_75%)]"
          opacity={0.35}
        />
        <div className="relative">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-t1">
            Fully encrypted lending, <span className="text-gradient-gold">live on Sepolia.</span>
          </h2>
          <p className="text-t2 text-sm mt-4">
            Seven markets, faucet included — try the whole lifecycle in five minutes.
          </p>
          <div className="flex flex-wrap gap-3 justify-center mt-8">
            <Link to="/app" className="btn-primary text-base px-8 py-3">
              Launch cLend
            </Link>
            <Link to="/faucet" className="btn-ghost text-base px-8 py-3">
              Get test assets
            </Link>
          </div>
        </div>
      </div>
    </motion.section>
  );
}
