import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// COOP/COEP headers: the Zama relayer SDK uses WASM + SharedArrayBuffer.
// optimizeDeps exclusion: Vite's pre-bundler breaks the SDK's import.meta.url
// WASM loading. Both are hard requirements, not preferences.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    exclude: ["@zama-fhe/relayer-sdk"],
  },
  worker: {
    format: "es",
  },
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
    // Project lives on /mnt/c under WSL2 — inotify events don't cross the
    // filesystem boundary, so HMR needs polling or it serves stale bundles.
    watch: {
      usePolling: true,
      interval: 400,
    },
  },
  preview: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
});
