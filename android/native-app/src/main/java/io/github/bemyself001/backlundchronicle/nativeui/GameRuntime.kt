package io.github.bemyself001.backlundchronicle.nativeui

import app.cash.zipline.EngineApi
import app.cash.zipline.InterruptHandler
import app.cash.zipline.QuickJs
import org.json.JSONObject

/** All access is confined to the ViewModel's single rules dispatcher. */
@OptIn(EngineApi::class)
class GameRuntime(source: String) : AutoCloseable {
    private val js = QuickJs.create()
    private var deadline = Long.MAX_VALUE
    init {
        js.memoryLimit = 128L * 1024 * 1024
        js.maxStackSize = 2L * 1024 * 1024
        js.interruptHandler = object : InterruptHandler {
            override fun poll() = System.nanoTime() > deadline || Thread.currentThread().isInterrupted
        }
        deadline = System.nanoTime() + 15_000_000_000L
        try { js.evaluate(source, "engine.js") }
        catch (error: Throwable) { js.close(); throw error }
        finally { deadline = Long.MAX_VALUE }
    }
    fun call(operation: String, args: JSONObject = JSONObject()): Any? {
        deadline = System.nanoTime() + 10_000_000_000L
        try {
            // JSON quoting prevents player text and model output from becoming code.
            val script = "backlundNative(${JSONObject.quote(operation)}, ${JSONObject.quote(args.toString())})"
            val result = JSONObject(js.evaluate(script, "native-call.js") as String)
            check(result.optBoolean("ok")) { result.optString("error", "本地规则执行失败") }
            return result.opt("data").takeUnless { it == JSONObject.NULL }
        } finally { deadline = Long.MAX_VALUE }
    }
    fun objectCall(operation: String, args: JSONObject = JSONObject()) = call(operation, args) as? JSONObject ?: JSONObject()
    override fun close() = js.close()
}
