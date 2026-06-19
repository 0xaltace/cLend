import { Faucet } from "../components/Faucet";

export function FaucetPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 pb-16 pt-6 space-y-4">
      <div>
        <h2 className="text-xl font-black">Faucet</h2>
        <p className="text-xs text-slate-400 max-w-2xl mt-1">
          Claim test tokens to try cLend on Sepolia. Wrapping turns a public ERC-20 into its encrypted
          ERC-7984 form; unwrap any time to go back.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-2 text-center text-xs">
        {[
          { n: "1", t: "Mint", d: "Open-mint mock ERC-20 (public balance)" },
          { n: "2", t: "Approve", d: "Allow the official wrapper to pull it" },
          { n: "3", t: "Wrap", d: "Balance becomes encrypted ERC-7984" },
        ].map((s) => (
          <div key={s.n} className="panel p-3">
            <div className="w-6 h-6 rounded-full bg-accent text-ink font-black grid place-items-center mx-auto mb-1.5 text-xs">
              {s.n}
            </div>
            <div className="font-bold">{s.t}</div>
            <div className="text-slate-500 mt-0.5">{s.d}</div>
          </div>
        ))}
      </div>

      <Faucet />

      <p className="text-[11px] text-slate-500">
        Sepolia ETH for gas:{" "}
        <a className="text-accent-2 underline" href="https://cloud.google.com/application/web3/faucet/ethereum/sepolia" target="_blank" rel="noreferrer">
          Google Cloud faucet
        </a>{" "}
        ·{" "}
        <a className="text-accent-2 underline" href="https://www.alchemy.com/faucets/ethereum-sepolia" target="_blank" rel="noreferrer">
          Alchemy faucet
        </a>
      </p>
    </div>
  );
}
