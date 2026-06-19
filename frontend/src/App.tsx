import { useEffect } from "react";
import { BrowserRouter, Outlet, Route, Routes, useLocation } from "react-router-dom";

import { Footer } from "./components/Footer";
import { Nav } from "./components/Nav";
import { DecryptionProvider } from "./context/DecryptionContext";
import { AppPage } from "./pages/AppPage";
import { FaucetPage } from "./pages/FaucetPage";
import { Landing } from "./pages/Landing";
import { LiquidationsPage } from "./pages/LiquidationsPage";
import { PortfolioPage } from "./pages/PortfolioPage";

function Shell() {
  const { pathname } = useLocation();
  // Every route change starts at the top of the page.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname]);
  return (
    <div className="min-h-screen flex flex-col">
      {pathname !== "/" && <Nav />}
      <div className="flex-1">
        <Outlet />
      </div>
      <Footer />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <DecryptionProvider>
        <Routes>
          <Route element={<Shell />}>
            <Route path="/" element={<Landing />} />
            <Route path="/app" element={<AppPage />} />
            <Route path="/portfolio" element={<PortfolioPage />} />
            <Route path="/liquidations" element={<LiquidationsPage />} />
            <Route path="/faucet" element={<FaucetPage />} />
          </Route>
        </Routes>
      </DecryptionProvider>
    </BrowserRouter>
  );
}
