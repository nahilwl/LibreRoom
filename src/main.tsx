import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { enableCrossOriginIsolation, markIsolationState } from "./lib/isolation";
import "./index.css";

markIsolationState();
enableCrossOriginIsolation();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
