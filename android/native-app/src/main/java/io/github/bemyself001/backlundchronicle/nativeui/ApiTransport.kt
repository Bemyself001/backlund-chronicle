package io.github.bemyself001.backlundchronicle.nativeui

import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.suspendCancellableCoroutine
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.ResponseBody
import okio.Buffer
import org.json.JSONArray
import org.json.JSONObject

class StreamCompletion {
    private val calls = sortedMapOf<Int, JSONObject>()
    private val content = StringBuilder()
    private val reasoning = StringBuilder()
    private var finish = ""
    private var usage: JSONObject? = null
    fun event(raw: String): String? {
        if (raw.isBlank() || raw.trim() == "[DONE]") return null
        val event = JSONObject(raw)
        usage = event.optJSONObject("usage") ?: usage
        val choice = event.optJSONArray("choices")?.optJSONObject(0) ?: return null
        if (!choice.isNull("finish_reason")) finish = choice.optString("finish_reason")
        val delta = choice.optJSONObject("delta") ?: return null
        val text = delta.opt("content") as? String
        if (text != null) content.append(text)
        reasoning.append((delta.opt("reasoning_content") ?: delta.opt("reasoning")) as? String ?: "")
        val tools = delta.optJSONArray("tool_calls") ?: JSONArray()
        for (index in 0 until tools.length()) {
            val fragment = tools.getJSONObject(index)
            val target = calls.getOrPut(fragment.optInt("index", index)) { JSONObject().put("type", "function").put("function", JSONObject().put("name", "").put("arguments", "")) }
            if (fragment.has("id")) target.put("id", fragment.getString("id"))
            val fn = fragment.optJSONObject("function") ?: continue
            val joined = target.getJSONObject("function")
            for (key in listOf("name", "arguments")) if (!fn.isNull(key)) {
                val part = fn.optString(key)
                val previous = joined.optString(key)
                joined.put(key, if (key == "name" && previous == part) previous else previous + part)
            }
        }
        return if (text != null) content.toString() else null
    }
    fun result() = JSONObject().put("choices", JSONArray().put(JSONObject().put("finish_reason", finish).put("message", JSONObject()
        .put("content", content.toString()).put("reasoning_content", reasoning.toString()).put("tool_calls", JSONArray(calls.values.toList())))))
        .apply { usage?.let { put("usage", it) } }
}

class ApiTransport {
    private val client = OkHttpClient.Builder().connectTimeout(20, TimeUnit.SECONDS).readTimeout(150, TimeUnit.SECONDS).callTimeout(180, TimeUnit.SECONDS).build()
    private fun readBounded(body: ResponseBody, maximum: Long, truncate: Boolean = false): String {
        val input = body.source()
        val buffer = Buffer()
        while (buffer.size <= maximum && input.read(buffer, minOf(8192L, maximum + 1 - buffer.size)) != -1L) {
            if (buffer.size > maximum && truncate) break
        }
        require(truncate || buffer.size <= maximum) { "API响应过大，请降低输出预算。" }
        return buffer.readUtf8(minOf(buffer.size, maximum))
    }
    suspend fun complete(settings: JSONObject, key: String, body: JSONObject, preview: (String) -> Unit = {}): JSONObject {
        require(key.isNotBlank()) { "请先在设置中填写API密钥。" }
        val base = settings.optString("baseUrl").trim().trimEnd('/')
        require(base.startsWith("https://") || base.startsWith("http://")) { "API地址必须以https://或http://开头。" }
        val url = if (base.endsWith("/chat/completions")) base else "$base/chat/completions"
        val builder = Request.Builder().url(url).header("Authorization", "Bearer $key").header("Content-Type", "application/json")
        val custom = JSONObject(settings.optString("customHeaders", "{}").ifBlank { "{}" })
        custom.keys().forEach { name -> builder.header(name, custom.getString(name)) }
        val request = builder.post(body.toString().toRequestBody("application/json; charset=utf-8".toMediaType())).build()
        return suspendCancellableCoroutine { continuation ->
            val call = client.newCall(request)
            continuation.invokeOnCancellation { call.cancel() }
            call.enqueue(object : Callback {
                override fun onFailure(call: Call, error: IOException) { if (continuation.isActive) continuation.resumeWithException(IOException(error.message?.replace(key, "[密钥]") ?: "网络请求失败")) }
                override fun onResponse(call: Call, response: Response) {
                    try {
                        response.use {
                            val source = response.body ?: throw IOException("API返回了空响应")
                            if (!response.isSuccessful) {
                                val detail = readBounded(source, 1024, truncate = true)
                                throw IOException("API请求失败（${response.code}）：${detail.replace(key, "[密钥]")}")
                            }
                            val result = if (response.header("Content-Type", "")!!.contains("text/event-stream")) {
                                val completion = StreamCompletion()
                                val input = source.source()
                                val data = StringBuilder()
                                var received = 0
                                fun flush() {
                                    if (data.isNotEmpty()) { completion.event(data.toString())?.let(preview); data.setLength(0) }
                                }
                                while (!input.exhausted() && continuation.isActive) {
                                    val line = input.readUtf8Line() ?: break
                                    received += line.length
                                    check(received <= 10 * 1024 * 1024) { "API响应过大，请降低输出预算。" }
                                    if (line.isEmpty()) flush() else if (line.startsWith("data:")) {
                                        if (data.isNotEmpty()) data.append('\n')
                                        data.append(line.removePrefix("data:").trimStart())
                                    }
                                }
                                flush(); completion.result()
                            } else {
                                val raw = readBounded(source, 10L * 1024 * 1024)
                                try { JSONObject(raw) } catch (_: Exception) { JSONObject().put("choices", JSONArray().put(JSONObject().put("message", JSONObject().put("content", raw)))) }
                            }
                            if (continuation.isActive) continuation.resume(result)
                        }
                    } catch (error: Exception) { if (continuation.isActive) continuation.resumeWithException(error) }
                }
            })
        }
    }
}
