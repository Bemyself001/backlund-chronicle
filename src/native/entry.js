import "./polyfills.js";
import { createNativeSession } from "./session.js";

const session = createNativeSession();
globalThis.backlundNative = (operation, json = "{}") => {
  try {
    if (!Object.hasOwn(session, operation)) throw new Error("不支持的游戏操作。");
    return JSON.stringify({ ok: true, data: session[operation](JSON.parse(json)) });
  } catch (error) {
    return JSON.stringify({ ok: false, error: error.message || "本地规则执行失败。" });
  }
};
