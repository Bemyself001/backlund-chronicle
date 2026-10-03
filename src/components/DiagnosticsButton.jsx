import { IS_STARTUP_TEST } from "../services/startup.js";

export default function DiagnosticsButton({ className }) {
  if (!IS_STARTUP_TEST) return null;
  return <button id="startup-open" className={className} type="button" aria-controls="startup-panel"
    title="启动与输入诊断" onClick={() => window.__startupDiagnostics?.open()}>启动诊断</button>;
}
