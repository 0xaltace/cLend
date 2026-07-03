import { AnimatePresence, motion } from "framer-motion";

import { IconSearch } from "./Icons";
import { CipherValue } from "./viz/CipherValue";

export type TheaterState = { phase: "scanning" } | { phase: "verdict"; liquidatable: boolean } | null;

/**
 * The one-bit moment, staged: encrypted comparison streams by, then the KMS
 * verdict lands as a single bit. The entire public output of a solvency check.
 */
export function VerdictTheater({ state, onClose }: { state: TheaterState; onClose: () => void }) {
  return (
    <AnimatePresence>
      {state && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          data-theme="dark"
          className="fixed inset-0 z-50 backdrop-blur-sm grid place-items-center"
          style={{ background: "rgba(3, 5, 10, 0.92)" }}
          onClick={state.phase === "verdict" ? onClose : undefined}
        >
          <div className="text-center max-w-md px-6">
            {state.phase === "scanning" ? (
              <>
                <motion.div
                  className="mx-auto w-24 h-24 rounded-full border-2 border-accent-2/40 grid place-items-center mb-6"
                  animate={{ scale: [1, 1.12, 1], borderColor: ["#4dc8fb44", "#4dc8fbaa", "#4dc8fb44"] }}
                  transition={{ repeat: Infinity, duration: 1.4 }}
                >
                  <IconSearch size={30} className="text-accent-2" />
                </motion.div>
                <div className="font-mono text-xs text-accent-2/80 space-y-1.5 mb-5">
                  <div>
                    enc(collateral) × price × LLTV <span className="text-t3">vs</span> enc(debt) × index
                  </div>
                  {[0, 1, 2].map((i) => (
                    <div key={i}>
                      <CipherValue value="" hidden chars={42} className="text-[10px]" />
                    </div>
                  ))}
                </div>
                <div className="text-sm text-t2 font-semibold">Comparing encrypted values…</div>
                <div className="text-[11px] text-t3 mt-1">
                  The KMS reveals only the comparison result, not the values
                </div>
              </>
            ) : (
              <>
                <motion.div
                  initial={{ scale: 0.3, rotateY: 180, opacity: 0 }}
                  animate={{ scale: 1, rotateY: 0, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 200, damping: 16 }}
                  className={`mx-auto w-28 h-28 rounded-2xl grid place-items-center font-mono font-black text-6xl mb-5 ${
                    state.liquidatable
                      ? "bg-neg/15 text-neg border-2 border-neg shadow-[0_0_60px_-10px_rgba(255,112,112,0.7)]"
                      : "bg-pos/15 text-pos border-2 border-pos shadow-[0_0_60px_-10px_rgba(47,230,168,0.7)]"
                  }`}
                >
                  {state.liquidatable ? "1" : "0"}
                </motion.div>
                <div className={`font-black text-xl ${state.liquidatable ? "text-neg" : "text-pos"}`}>
                  {state.liquidatable ? "LIQUIDATABLE" : "POSITION HEALTHY"}
                </div>
                <div className="text-[11px] text-t2 mt-2 leading-relaxed">
                  This single bit is the entire public output of the check.
                  <br />
                  Collateral, debt and health factor remain encrypted.
                </div>
                <button className="btn-ghost mt-5 text-xs" onClick={onClose}>
                  Close
                </button>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
