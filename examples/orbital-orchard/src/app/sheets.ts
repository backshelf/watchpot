import { createContext, useContext } from "react";

/** The global sheets, by kind. A new sheet adds its kind here and its line to the registry in `App.tsx`. */
export type Sheet =
  | { kind: "about" }
  /** The graft reveal over the last pull; `n` counts the opens, so Open again is a new result. */
  | { kind: "reveal"; n: number };

/** Opens a sheet from anywhere under the app (a screen is a tab's component and takes no props). */
export const OpenSheetContext = createContext<(sheet: Sheet) => void>(() => {});

export const useOpenSheet = () => useContext(OpenSheetContext);
