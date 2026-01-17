import { createContext, useContext } from "react";
import { useAppVisibility } from "../lib/useAppVisibility";

const AppVisibilityContext = createContext(true);

export function AppVisibilityProvider({ children }) {
  const isAppVisible = useAppVisibility();
  return (
    <AppVisibilityContext.Provider value={isAppVisible}>
      {children}
    </AppVisibilityContext.Provider>
  );
}

export function useAppVisibilityContext() {
  return useContext(AppVisibilityContext);
}
