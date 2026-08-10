import { useCallback, useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";
const KEY = "tandem:theme:v1";

/**
 * Theme preference. "system" removes the attribute entirely so the tokens'
 * prefers-color-scheme rules take over; an explicit choice stamps data-theme on
 * <html>, which the token file is written to let win in both directions.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return (localStorage.getItem(KEY) as Theme) ?? "system";
    } catch {
      return "system";
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      /* private browsing — the choice just will not persist */
    }
  }, [theme]);

  const cycle = useCallback(() => {
    setTheme((t) => (t === "system" ? "light" : t === "light" ? "dark" : "system"));
  }, []);

  return { theme, setTheme, cycle };
}
