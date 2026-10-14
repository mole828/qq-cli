import React, { createContext, useCallback, useContext, useState } from "react";
import { parseUiStyle, type UiStyle } from "../config.js";
import { writeUiStyleConfig } from "../ui-config.js";

export type { UiStyle };

export function resolveUiStyle(
  flag: string | undefined,
  env: string | undefined,
  persisted: string | undefined
): UiStyle {
  return parseUiStyle(flag) ?? parseUiStyle(env) ?? parseUiStyle(persisted) ?? "classic";
}

interface ThemeContextValue {
  style: UiStyle;
  setStyle: (style: UiStyle) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  style: "classic",
  setStyle: () => {},
});

export function ThemeProvider({
  initialStyle = "classic",
  children,
}: {
  initialStyle?: UiStyle;
  children: React.ReactNode;
}) {
  const [style, setStyleState] = useState<UiStyle>(initialStyle);
  const setStyle = useCallback((next: UiStyle) => {
    setStyleState(next);
    writeUiStyleConfig(next);
  }, []);

  return (
    <ThemeContext.Provider value={{ style, setStyle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useUiStyle() {
  return useContext(ThemeContext);
}
