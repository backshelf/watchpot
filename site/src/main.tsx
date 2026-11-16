import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { IdleStoreProvider } from "watchpot/react";
import { App } from "./app/App";
import { followSystem } from "./app/scheme";
import { store } from "./app/store";

followSystem();

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <IdleStoreProvider store={store}>
        <App />
      </IdleStoreProvider>
    </StrictMode>,
  );
}
