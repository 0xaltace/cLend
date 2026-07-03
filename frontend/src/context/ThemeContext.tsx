/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type Theme = "dark" | "light";

const Ctx = createContext<{ theme: Theme; toggle: () => void }>({ theme: "dark", toggle: () => {} });
export const useTheme = () => useContext(Ctx);

function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

/** Theme is applied pre-paint by the inline script in index.html; this context
 *  just mirrors it into React state and persists changes. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(currentTheme);

  const toggle = useCallback(() => {
    const next: Theme = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("clend-theme", next);
    } catch {
      // private mode: theme just won't persist
    }
    setTheme(next);
  }, []);

  return <Ctx.Provider value={{ theme, toggle }}>{children}</Ctx.Provider>;
}
