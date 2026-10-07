package io.github.bemyself001.backlundchronicle.nativeui

import java.io.File
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class NativeRuntimeTest {
    @Test fun quickJsRunsTheRealGameWithoutBrowserGlobals() {
        val source = File("src/main/assets/engine.js").readText()
        GameRuntime(source).use { runtime ->
            val catalog = runtime.objectCall("catalog")
            assertEquals(22, catalog.getJSONArray("pathways").length())
            val created = runtime.objectCall("create", JSONObject().put("character", JSONObject().put("name", "原生角色")))
            assertEquals(0, created.getInt("turn"))
            val waiting = runtime.objectCall("special", JSONObject().put("operation", "wait").put("hours", 24).put("revision", created.getJSONObject("special").getInt("revision")).put("expectedTurn", 0).put("expectedWorldTime", created.getString("worldTime")))
            assertEquals(1, waiting.getInt("turn"))
            assertNotEquals(created.getString("worldTime"), waiting.getString("worldTime"))
            val payload = runtime.objectCall("export")
            assertFalse(payload.toString().contains("apiKey"))
            val restored = runtime.objectCall("load", JSONObject().put("payload", payload))
            assertEquals(waiting.getString("worldTime"), restored.getString("worldTime"))
        }
    }
    @Test fun streamingJoinsSplitArgumentsAndRetainsFinalChoices() {
        val stream = StreamCompletion()
        stream.event("""{"choices":[{"delta":{"content":"你推开门。","tool_calls":[{"index":0,"id":"call1","function":{"name":"ui__present_choices","arguments":"{\"choices\":"}}]}}]}""")
        stream.event("""{"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"[]}"}}]},"finish_reason":"tool_calls"}]}""")
        val message = stream.result().getJSONArray("choices").getJSONObject(0).getJSONObject("message")
        assertEquals("你推开门。", message.getString("content"))
        assertEquals("ui__present_choices", message.getJSONArray("tool_calls").getJSONObject(0).getJSONObject("function").getString("name"))
        assertEquals("{\"choices\":[]}", message.getJSONArray("tool_calls").getJSONObject(0).getJSONObject("function").getString("arguments"))
    }
}
