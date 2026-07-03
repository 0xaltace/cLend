import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { WagmiProvider } from "wagmi";

import App from "./App";
import { WalletModalProvider } from "./components/WalletModal";
import { ThemeProvider } from "./context/ThemeContext";
import "./index.css";
import { wagmiConfig } from "./lib/wagmi";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 15_000, refetchOnWindowFocus: false },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <WalletModalProvider>
            <App />
          </WalletModalProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>,
);
