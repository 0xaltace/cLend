import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { Logo } from "../components/Logo";
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
      <div className="max-w-5xl mx-auto px-4">
        <Hero />
        <StatsStrip />
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
    <header className="sticky top-0 z-40 backdrop-blur-md bg-ink/75 border-b border-line/60">
      <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
        <Logo withTag />
        <nav className="hidden md:flex items-center gap-6 text-sm text-slate-300">
          <a href="#how" className="hover:text-accent transition-colors">
            How it works
          </a>
          <a href="#compare" className="hover:text-accent transition-colors">
            Compare
          </a>
          <a href="#architecture" className="hover:text-accent transition-colors">
            Architecture
          </a>
          <Link to="/faucet" className="hover:text-accent transition-colors">
            Faucet
          </Link>
        </nav>
        <Link to="/app" className="btn-primary">
          Launch App
        </Link>
      </div>
    </header>
  );
}

function StatsStrip() {
  const { totalUsd } = useGlobalTvl();
  const stats = [
    { label: "Isolated markets", value: "7", cipher: false },
    { label: "Official registry assets", value: "7", cipher: false },
    { label: "Total value locked", value: totalUsd > 0 ? usd(totalUsd) : "—", sub: "as of last sync", cipher: false },
    { label: "Largest position", value: "", cipher: true },
  ];
  return (
    <motion.div {...fadeUp} className="panel grid grid-cols-2 md:grid-cols-4 divide-x divide-line/60 mb-4">
      {stats.map((s) => (
        <div key={s.label} className="p-4 text-center">
          <div className="font-mono font-black text-xl">
            {s.cipher ? <CipherValue value="" hidden chars={8} /> : s.value}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mt-1">
            {s.label}
            {s.cipher && <span className="text-accent-2"> — Encrypted by design</span>}
            {s.sub && <span className="text-slate-600"> · {s.sub}</span>}
          </div>
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
    <section className="pt-20 pb-16 grid lg:grid-cols-2 gap-10 items-center">
      <div>
        <motion.h1
          className="text-5xl font-black leading-[1.05] tracking-tight"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          Lend. Borrow.
          <br />
          <span className="text-accent">Reveal nothing.</span>
        </motion.h1>
        <motion.p
          className="text-slate-400 mt-5 max-w-md leading-relaxed"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25, duration: 0.6 }}
        >
          cLend is the first <b className="text-slate-200">fully encrypted</b> lending platform. Your
          collateral, debt and health factor are stored on-chain as FHE ciphertext, and the protocol
          enforces solvency without ever seeing your numbers.
        </motion.p>
        <motion.div
          className="flex gap-3 mt-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.45 }}
        >
          <Link to="/app" className="btn-primary text-base px-6 py-3">
            Explore the dApp →
          </Link>
          <a href="#how" className="btn-ghost text-base px-6 py-3">
            How it works
          </a>
        </motion.div>
        <motion.div
          className="flex gap-4 mt-8 text-[11px] text-slate-500"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          <span>✓ Official Wrappers Registry assets</span>
          <span>✓ Chainlink oracles</span>
          <span>✓ Verified on Etherscan</span>
        </motion.div>
      </div>

      {/* The duality demo: what the chain sees vs what you see */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.3, duration: 0.6 }}
        className="panel p-5 relative overflow-hidden"
      >
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-bold tracking-wider text-slate-400">
            {revealed ? "WHAT YOU SEE (decrypted locally)" : "WHAT THE CHAIN SEES"}
          </span>
          <span className={`tag ${revealed ? "bg-pos/10 text-pos" : "bg-accent-2/10 text-accent-2"}`}>
            {revealed ? "🔓 your key" : "🔒 ciphertext"}
          </span>
        </div>
        <div className="space-y-2.5 font-mono text-sm">
          <DemoRow label="Collateral" clear="12.5 cWETH" hidden={!revealed} />
          <DemoRow label="Debt" clear="9,420 cUSDC" hidden={!revealed} />
          <DemoRow label="Health factor" clear="1.74 — SAFE" hidden={!revealed} />
          <DemoRow label="Liquidation price" clear="$1,254 / ETH" hidden={!revealed} />
        </div>
        <div className="mt-4 text-[11px] text-slate-500">
          The encrypted state is all that liquidation bots, copy-traders, and competitors can ever see.
        </div>
      </motion.div>
    </section>
  );
}

function DemoRow({ label, clear, hidden }: { label: string; clear: string; hidden: boolean }) {
  return (
    <div className="flex justify-between items-center bg-panel-2 rounded-lg px-3 py-2">
      <span className="text-slate-400 text-xs">{label}</span>
      <CipherValue value={clear} hidden={hidden} chars={14} className="font-bold" />
    </div>
  );
}

function Problem() {
  return (
    <motion.section {...fadeUp} className="py-12">
      <h2 className="text-2xl font-black mb-6">DeFi lending has a surveillance problem</h2>
      <div className="grid md:grid-cols-3 gap-3">
        {[
          {
            icon: "🎯",
            title: "Your liquidation price is public",
            body: "On Aave or Morpho, bots maintain sorted lists of every position's health factor and snipe liquidations the moment you cross 1.0 — some actively push prices toward visible liquidation clusters.",
          },
          {
            icon: "🪞",
            title: "Your strategy is copyable",
            body: "Position sizes broadcast your conviction and link your wallets to your identity, so anyone can monitor and copy your leverage decisions in real time.",
          },
          {
            icon: "🏛️",
            title: "Institutions can't use public books",
            body: "No fund can run a book where every counterparty sees its collateral, debt, and margin in real time. For most institutions, confidentiality is a compliance requirement.",
          },
        ].map((c) => (
          <div key={c.title} className="panel p-4">
            <div className="text-2xl mb-2">{c.icon}</div>
            <div className="font-bold mb-1.5">{c.title}</div>
            <p className="text-xs text-slate-400 leading-relaxed">{c.body}</p>
          </div>
        ))}
      </div>
    </motion.section>
  );
}

function HowItWorks() {
  return (
    <motion.section {...fadeUp} className="py-12 scroll-mt-20" id="how">
      <h2 className="text-2xl font-black mb-2">How cLend works</h2>
      <p className="text-sm text-slate-400 mb-6 max-w-2xl">
        Fully homomorphic encryption lets the contract do math on numbers it cannot read. The flow has
        three steps:
      </p>
      <div className="grid md:grid-cols-3 gap-3">
        {[
          {
            n: "01",
            title: "Encrypt in your browser",
            body: "Amounts are encrypted client-side with a ZK proof of well-formedness. The transaction carries only ciphertext, so the mempool, the chain, and MEV bots learn nothing from it.",
          },
          {
            n: "02",
            title: "FHE math on-chain",
            body: "Borrow limits, interest, and solvency are computed directly on encrypted values. Requests above your limit are clamped inside the ciphertext, so even a failed attempt reveals no information.",
          },
          {
            n: "03",
            title: "One public bit",
            body: "Liquidation needs a public verdict, so a keeper asks the KMS to decrypt exactly one boolean: liquidatable, yes or no. Position sizes stay encrypted, including from the liquidator.",
          },
        ].map((s) => (
          <div key={s.n} className="panel p-4 relative">
            <div className="font-mono text-accent-2/40 font-black text-3xl absolute right-3 top-2">{s.n}</div>
            <div className="font-bold mb-1.5 mt-1">{s.title}</div>
            <p className="text-xs text-slate-400 leading-relaxed">{s.body}</p>
          </div>
        ))}
      </div>
      <div className="panel p-4 mt-3 flex flex-wrap items-center gap-6">
        <div>
          <div className="font-bold text-sm mb-1">Algorithmic rates, no rate oracle</div>
          <p className="text-xs text-slate-400 max-w-sm leading-relaxed">
            Pool aggregates are disclosed at rate syncs (the only other thing ever decrypted) and drive an
            Aave-style kinked curve. Individual positions never leave ciphertext.
          </p>
        </div>
        <RateCurve utilization6={500_000} />
      </div>
    </motion.section>
  );
}

function Comparison({ id = "compare" }: { id?: string }) {
  const rows: Array<[string, string, string, string]> = [
    ["Balances", "Public", "Public", "Encrypted"],
    ["Collateral & debt", "Public", "Public", "Encrypted"],
    ["Health factor", "Public", "Public", "Encrypted — 1-bit verdict on demand"],
    ["Liquidation price", "Computable by anyone", "Computable by anyone", "Computable only by you"],
    ["Asset listing", "Governance vote", "Permissionless", "Permissionless, registry-gated"],
    ["Risk isolation", "Shared pool", "Isolated markets", "Isolated markets"],
  ];
  return (
    <motion.section {...fadeUp} className="py-12 scroll-mt-20" id={id}>
      <h2 className="text-2xl font-black mb-6">How cLend compares to Aave and Morpho</h2>
      <div className="panel overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-line text-slate-400">
              <th className="text-left p-3 font-semibold"></th>
              <th className="text-left p-3 font-semibold">Aave</th>
              <th className="text-left p-3 font-semibold">Morpho</th>
              <th className="text-left p-3 font-semibold text-accent">cLend</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([k, a, m, c]) => (
              <tr key={k} className="border-b border-line/50 last:border-0">
                <td className="p-3 font-bold text-slate-300">{k}</td>
                <td className="p-3 text-slate-400">{a}</td>
                <td className="p-3 text-slate-400">{m}</td>
                <td className="p-3 text-pos font-semibold">{c}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.section>
  );
}

function Architecture() {
  return (
    <motion.section {...fadeUp} className="py-12 scroll-mt-20" id="architecture">
      <h2 className="text-2xl font-black mb-6">Registry-native by construction</h2>
      <div className="panel p-5">
        <div className="grid md:grid-cols-4 gap-2 text-center text-xs font-mono">
          {[
            { t: "Zama Wrappers Registry", d: "Official ERC-20 ↔ ERC-7984 pairs", c: "text-accent-2" },
            { t: "ClendFactory", d: "Permissionless markets, registry + feed gated", c: "text-accent" },
            { t: "ClendMarket ×7", d: "Isolated FHE lending pairs", c: "text-pos" },
            { t: "Chainlink", d: "Price feeds with staleness checks", c: "text-slate-300" },
          ].map((b, i) => (
            <div key={b.t} className="relative">
              <div className="panel bg-panel-2 p-3 h-full">
                <div className={`font-bold ${b.c}`}>{b.t}</div>
                <div className="text-slate-500 mt-1">{b.d}</div>
              </div>
              {i < 3 && (
                <div className="hidden md:block absolute top-1/2 -right-2.5 text-slate-600 font-bold">→</div>
              )}
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-400 mt-4 leading-relaxed">
          cLend never mints its own tokens. All seven markets are built on official registry wrappers —
          cWETH, cUSDC, cUSDT, cZAMA, ctGBP, cXAUt, cBRON — and the factory re-checks registry validity
          on-chain at creation, so a revoked wrapper can never enter a market. Anyone can list the next
          registry pair by calling the factory directly.
        </p>
      </div>
    </motion.section>
  );
}

function FinalCta() {
  return (
    <motion.section {...fadeUp} className="py-16 text-center">
      <h2 className="text-3xl font-black">Fully encrypted lending, live on Sepolia.</h2>
      <p className="text-slate-400 text-sm mt-3">
        Seven markets on official registry assets. Faucet included — try the whole lifecycle in five
        minutes.
      </p>
      <div className="flex gap-3 justify-center mt-7">
        <Link to="/app" className="btn-primary text-base px-7 py-3">
          Launch cLend →
        </Link>
        <Link to="/faucet" className="btn-ghost text-base px-7 py-3">
          Get test assets
        </Link>
      </div>
    </motion.section>
  );
}
