import { useEffect } from "react";
import { confirmAppReady } from "../services/updates.js";

export default function UpdateStartup() {
  useEffect(() => {
    confirmAppReady().catch((error) => console.warn("热更新启动确认失败", error));
  }, []);
  return null;
}
