import { Capacitor, registerPlugin } from "@capacitor/core";

export const STARTUP_VARIANT = import.meta.env?.VITE_STARTUP_VARIANT || "standard";
export const IS_STARTUP_TEST = STARTUP_VARIANT !== "standard";
const NativeStartup = registerPlugin("StartupDiagnostics");

export function startupStage(stage, initialize) {
  globalThis.__startupDiagnostics?.mark(stage);
  return initialize();
}

export function readNativeStartup() {
  if (!Capacitor.isPluginAvailable("StartupDiagnostics")) return;
  return NativeStartup.getInfo().then(info => globalThis.__startupDiagnostics?.native(info))
    .catch(() => globalThis.__startupDiagnostics?.mark("原生诊断读取失败"));
}

export function reportStartupReady() {
  globalThis.__startupDiagnostics?.ready();
  if (Capacitor.isPluginAvailable("StartupDiagnostics")) {
    NativeStartup.ready().catch(() => globalThis.__startupDiagnostics?.mark("原生启动确认失败"));
  }
}
