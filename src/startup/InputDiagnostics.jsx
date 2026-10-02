import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { IS_STARTUP_TEST, STARTUP_VARIANT, readNativeStartup } from "../services/startup.js";
import { watchInput } from "../services/inputFocus.js";

export default function InputDiagnostics() {
  const [value, setValue] = useState("");
  useEffect(() => {
    if (!IS_STARTUP_TEST) return;
    const panel = document.getElementById("input-diagnostics");
    const reset = document.getElementById("input-reset");
    panel.hidden = false;
    const monitor = watchInput(window, {
      recover: STARTUP_VARIANT === "compat",
      nativeInfo: readNativeStartup,
      // Do not mutate diagnostic UI during a gesture: layout changes can redirect its click.
      publish: records => window.__startupDiagnostics?.input(records),
    });
    const clear = () => monitor.clear();
    reset.addEventListener("click", clear);
    return () => { monitor.stop(); reset.removeEventListener("click", clear); panel.hidden = true; };
  }, []);
  const host = document.getElementById("input-probe-react");
  return IS_STARTUP_TEST && host ? createPortal(
    <label>游戏式输入框<input id="input-probe-controlled" autoComplete="off" value={value} onChange={event => setValue(event.target.value)} /></label>, host,
  ) : null;
}
