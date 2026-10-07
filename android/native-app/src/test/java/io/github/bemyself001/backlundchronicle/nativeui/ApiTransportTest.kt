package io.github.bemyself001.backlundchronicle.nativeui

import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class ApiTransportTest {
    @Test fun chunkedJsonIsReadWithoutAssumingContentLength() = runBlocking {
        MockWebServer().use { server ->
            server.enqueue(MockResponse().setHeader("Content-Type", "application/json").setChunkedBody("""{"choices":[{"message":{"content":"请求成功"}}]}""", 7))
            val result = ApiTransport().complete(JSONObject().put("baseUrl", server.url("/v1").toString()), "test-only-key", JSONObject().put("model", "test").put("stream", false))
            assertEquals("请求成功", result.getJSONArray("choices").getJSONObject(0).getJSONObject("message").getString("content"))
            val request = server.takeRequest()
            assertEquals("/v1/chat/completions", request.path)
            assertEquals("Bearer test-only-key", request.getHeader("Authorization"))
            assertFalse(request.body.readUtf8().contains("test-only-key"))
        }
    }
    @Test fun shortServerErrorsAreReadableAndDoNotExposeKeys() = runBlocking {
        MockWebServer().use { server ->
            server.enqueue(MockResponse().setResponseCode(401).setChunkedBody("invalid test-only-key", 3))
            try {
                ApiTransport().complete(JSONObject().put("baseUrl", server.url("/v1").toString()), "test-only-key", JSONObject())
                fail("Expected API rejection")
            } catch (error: Exception) {
                assertTrue(error.message!!.contains("401"))
                assertFalse(error.message!!.contains("test-only-key"))
            }
        }
    }
}
