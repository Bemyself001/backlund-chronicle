import { useEffect } from "react";
import { confirmAppReady } from "../services/updates.js";
import { IS_STARTUP_TEST, reportStartupReady } from "../services/startup.js";

export default function UpdateStartup() {
  useEffect(() => {
    // Two frames allow the first committed screen to paint before acknowledgement.
    let second;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        reportStartupReady();
        if (!IS_STARTUP_TEST) confirmAppReady().catch((error) => console.warn("热更新启动确认失败", error));
      });
    });
    return () => { cancelAnimationFrame(first); if (second) cancelAnimationFrame(second); };
  }, []);
  return null;
}
