import "startup-compat";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import UpdateStartup from "./components/UpdateStartup.jsx";
import StartupBoundary from "./startup/StartupBoundary.jsx";
import InputDiagnostics from "./startup/InputDiagnostics.jsx";
import { readNativeStartup } from "./services/startup.js";
import "./styles/reset.css";
import "./styles/tokens.css";
import "./styles/global.css";

window.__startupDiagnostics?.mark("主脚本及应用模块已执行");
readNativeStartup();
createRoot(document.getElementById("root")).render(
  <StrictMode>
    <StartupBoundary>
    <App />
    <UpdateStartup />
    <InputDiagnostics />
    </StartupBoundary>
  </StrictMode>,
);
