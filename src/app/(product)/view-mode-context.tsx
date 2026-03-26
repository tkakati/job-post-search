"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";

export type ProductViewMode = "post-feed" | "agent";

type ProductViewModeContextValue = {
  mode: ProductViewMode;
  setMode: (nextMode: ProductViewMode) => void;
};

const ProductViewModeContext = React.createContext<ProductViewModeContextValue | null>(null);

function parseViewMode(value: string | null | undefined): ProductViewMode {
  return value === "agent" ? "agent" : "post-feed";
}

function getWindowViewMode(): ProductViewMode {
  if (typeof window === "undefined") return "post-feed";
  return parseViewMode(new URL(window.location.href).searchParams.get("view"));
}

export function ProductViewModeProvider({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams();
  const searchParamMode = parseViewMode(searchParams?.get("view"));
  const [mode, setModeState] = React.useState<ProductViewMode>(searchParamMode);

  React.useEffect(() => {
    setModeState(searchParamMode);
  }, [searchParamMode]);

  React.useEffect(() => {
    const onPopState = () => {
      setModeState(getWindowViewMode());
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  const setMode = React.useCallback((nextMode: ProductViewMode) => {
    setModeState(nextMode);
    const url = new URL(window.location.href);
    if (url.searchParams.get("view") === nextMode) return;
    url.searchParams.set("view", nextMode);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  const value = React.useMemo<ProductViewModeContextValue>(
    () => ({ mode, setMode }),
    [mode, setMode],
  );

  return (
    <ProductViewModeContext.Provider value={value}>
      {children}
    </ProductViewModeContext.Provider>
  );
}

export function useProductViewMode() {
  const context = React.useContext(ProductViewModeContext);
  if (!context) {
    throw new Error("useProductViewMode must be used within ProductViewModeProvider");
  }
  return context;
}
