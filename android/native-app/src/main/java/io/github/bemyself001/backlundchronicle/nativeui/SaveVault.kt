package io.github.bemyself001.backlundchronicle.nativeui

import android.content.Context
import android.util.AtomicFile
import java.io.File
import org.json.JSONObject

class SaveVault(context: Context) {
    private val directory = File(context.filesDir, "native-saves").apply { mkdirs() }
    private fun file(slot: Int): AtomicFile {
        require(slot in 0..3)
        return AtomicFile(File(directory, "slot-$slot.json"))
    }
    fun read(slot: Int): JSONObject? {
        val target = file(slot)
        if (!target.baseFile.exists() && !File(target.baseFile.path + ".bak").exists()) return null
        return JSONObject(target.openRead().bufferedReader().use { it.readText() })
    }
    fun write(slot: Int, payload: JSONObject) {
        // Also strip credentials defensively at the final persistence boundary.
        val safe = JSONObject(payload.toString())
        safe.optJSONObject("game")?.apply { remove("apiKey"); remove("apiSettings") }
        val target = file(slot)
        val stream = target.startWrite()
        try {
            stream.write(safe.toString().toByteArray(Charsets.UTF_8))
            target.finishWrite(stream)
        } catch (error: Exception) { target.failWrite(stream); throw error }
    }
    fun delete(slot: Int) = file(slot).delete()
    fun labels() = (0..3).map { slot ->
        try { read(slot)?.optJSONObject("game")?.let { "${it.optJSONObject("character")?.optString("name")} · 第${it.optInt("turn")}轮" } ?: "空存档" }
        catch (_: Exception) { "存档读取失败（可保留并导出文件）" }
    }
}
