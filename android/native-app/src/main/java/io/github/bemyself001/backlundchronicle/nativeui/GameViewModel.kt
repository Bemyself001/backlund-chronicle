package io.github.bemyself001.backlundchronicle.nativeui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import java.util.concurrent.Executors
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import org.json.JSONArray
import org.json.JSONObject

data class GameUiState(
    val ready: Boolean = false, val catalog: JSONObject = JSONObject(), val game: JSONObject? = null,
    val panel: String = "home", val busy: Boolean = false, val phase: String = "", val preview: String = "",
    val error: String = "", val notice: String = "", val confirmations: JSONArray? = null,
    val saves: List<String> = listOf(), val settings: JSONObject = JSONObject(), val prompt: String = "",
)

class GameViewModel(application: Application) : AndroidViewModel(application) {
    private val executor = Executors.newSingleThreadExecutor { runnable -> Thread(runnable, "BacklundRules") }
    private val dispatcher = executor.asCoroutineDispatcher()
    private var runtime: GameRuntime? = null
    private val vault = SaveVault(application)
    private val preferences = SecureSettings(application)
    private val transport = ApiTransport()
    private val mutable = MutableStateFlow(GameUiState())
    val state = mutable.asStateFlow()
    var apiKey = ""
        private set
    private var turnJob: Job? = null
    private var decision: CompletableDeferred<JSONArray>? = null
    private var lastAction: JSONObject? = null
    init {
        viewModelScope.launch {
            try {
                val catalog = withContext(dispatcher) {
                    runtime = GameRuntime(application.assets.open("engine.js").bufferedReader().use { it.readText() })
                    runtime!!.objectCall("catalog")
                }
                val settings = JSONObject(catalog.getJSONObject("defaultSettings").toString())
                preferences.settings().keys().forEach { key -> settings.put(key, preferences.settings().get(key)) }
                apiKey = preferences.savedKey()
                val prompt = preferences.prompt() ?: catalog.getString("defaultPrompt")
                mutable.update { it.copy(ready = true, catalog = catalog, settings = settings, prompt = prompt, saves = vault.labels()) }
            } catch (error: Exception) { mutable.update { it.copy(error = "原生引擎启动失败：${error.message}") } }
        }
    }
    fun panel(panel: String) { mutable.update { it.copy(panel = panel, notice = "") } }
    private suspend fun engine(operation: String, args: JSONObject = JSONObject()) = withContext(dispatcher) { runtime!!.objectCall(operation, args) }
    private suspend fun publish(view: JSONObject, panel: String = "story") {
        val payload = engine("export")
        try { withContext(dispatcher) { vault.write(0, payload) } }
        catch (error: Exception) {
            // Restore the last durable save if the disk write fails.
            withContext(dispatcher) { vault.read(0)?.let { runtime!!.objectCall("load", JSONObject().put("payload", it)) } }
            throw error
        }
        mutable.update { it.copy(game = view, panel = panel, saves = vault.labels()) }
    }
    private fun work(block: suspend () -> Unit) {
        if (!state.value.ready || state.value.busy) return
        mutable.update { it.copy(busy = true, error = "", notice = "") }
        turnJob = viewModelScope.launch {
            try { block() }
            catch (_: CancellationException) { engine("cancel"); mutable.update { it.copy(notice = "已取消，本轮未提交。") } }
            catch (error: Exception) { engine("cancel"); mutable.update { it.copy(error = error.message ?: "操作失败，请重试。") } }
            finally { decision = null; mutable.update { it.copy(busy = false, phase = "", preview = "", confirmations = null) }; turnJob = null }
        }
    }
    fun create(character: JSONObject) = work { publish(engine("create", JSONObject().put("character", character))) }
    fun load(slot: Int) = work { val payload = withContext(dispatcher) { vault.read(slot) } ?: error("此存档位为空。") ; publish(engine("load", JSONObject().put("payload", payload))) }
    fun importSave(text: String) = work {
        require(text.length <= 20 * 1024 * 1024) { "存档文件超过20MB。" }
        publish(engine("load", JSONObject().put("payload", JSONObject(text))))
        mutable.update { it.copy(notice = "存档已导入并保存，API密钥需单独设置。") }
    }
    fun save(slot: Int) = work { val payload = engine("export"); withContext(dispatcher) { vault.write(slot, payload) }; mutable.update { it.copy(saves = vault.labels(), notice = "存档已保存。") } }
    fun delete(slot: Int) = work { withContext(dispatcher) { vault.delete(slot) }; mutable.update { it.copy(saves = vault.labels(), notice = "存档已删除。") } }
    suspend fun exportSave(): String = engine("export").toString(2)
    fun saveSettings(settings: JSONObject, key: String, prompt: String) = work {
        JSONObject(settings.optString("customHeaders", "{}"))
        require(settings.optString("model").isNotBlank()) { "模型名称不能为空。" }
        withContext(dispatcher) { preferences.save(settings, key); preferences.prompt(prompt) }
        apiKey = key
        mutable.update { it.copy(settings = JSONObject(settings.toString()).apply { remove("apiKey") }, prompt = prompt, notice = "设置已保存。") }
    }
    fun action(action: String, options: JSONObject = JSONObject()) {
        if (state.value.busy) return
        lastAction = JSONObject().put("action", action).put("options", options)
        work { runAction(action, options) }
    }
    private suspend fun runAction(action: String, options: JSONObject) {
        val initial = engine("begin", JSONObject().put("action", action).put("options", options).put("settings", state.value.settings).put("prompt", state.value.prompt))
        if (initial.optBoolean("complete")) { publish(initial.getJSONObject("view"), initial.optString("panel", "story")); return }
        mutable.update { it.copy(phase = "规划行动", panel = "story") }
        var response = transport.complete(state.value.settings, apiKey, initial.getJSONObject("request"))
        var plan = engine("plan", JSONObject().put("response", response))
        while (plan.has("repairIndex")) {
            mutable.update { it.copy(phase = "修复工具参数") }
            response = transport.complete(state.value.settings, apiKey, plan.getJSONObject("request"))
            plan = engine("plan", JSONObject().put("response", response).put("repairedIndex", plan.getInt("repairIndex")))
        }
        val changes = plan.optJSONArray("confirmations") ?: JSONArray()
        val approved = if (changes.length() > 0) {
            decision = CompletableDeferred()
            mutable.update { it.copy(phase = "等待物品与晋升确认", confirmations = changes) }
            decision!!.await()
        } else JSONArray()
        mutable.update { it.copy(phase = "生成最终剧情", confirmations = null) }
        val render = engine("settle", JSONObject().put("approvedKeys", approved))
        response = transport.complete(state.value.settings, apiKey, render.getJSONObject("request")) { text -> if (state.value.settings.optBoolean("nativeTools")) mutable.update { it.copy(preview = text) } }
        withContext(NonCancellable) {
            val finished = engine("finish", JSONObject().put("response", response))
            publish(finished.getJSONObject("view"))
            lastAction = null
        }
        if (state.value.game?.optJSONArray("choices")?.length() != 3) {
            // Choice recovery occurs after durable narrative settlement, never replaying the turn.
            try { recoverChoices() } catch (_: Exception) { mutable.update { it.copy(notice = "剧情已保存，行动建议可单独重新生成。") } }
        }
        try {
            val request = engine("summaryRequest", JSONObject().put("settings", state.value.settings))
            if (request.has("request")) {
                mutable.update { it.copy(phase = "整理故事记忆") }
                val summary = transport.complete(state.value.settings, apiKey, request.getJSONObject("request"))
                publish(engine("summaryFinish", JSONObject().put("response", summary)))
            }
        } catch (_: Exception) { /* The saved story and pending memory episodes remain durable. */ }
    }
    fun confirm(keys: JSONArray) { decision?.complete(keys) }
    fun cancel() { turnJob?.cancel(); decision?.cancel() }
    fun retry() { lastAction?.let { action(it.getString("action"), it.getJSONObject("options")) } }
    private suspend fun recoverChoices() {
        mutable.update { it.copy(phase = "补全行动建议", preview = "") }
        val request = engine("choiceRequest", JSONObject().put("settings", state.value.settings).put("prompt", state.value.prompt))
        val response = transport.complete(state.value.settings, apiKey, request.getJSONObject("request"))
        publish(engine("choices", JSONObject().put("response", response)))
    }
    fun choices() = work { recoverChoices() }
    fun pray() = work {
        val request = engine("prayerRequest", JSONObject().put("settings", state.value.settings))
        mutable.update { it.copy(phase = "生成祷文") }
        val response = transport.complete(state.value.settings, apiKey, request.getJSONObject("request"))
        withContext(NonCancellable) { publish(engine("prayerFinish", JSONObject().put("response", response))) }
    }
    fun special(request: JSONObject) = work { publish(engine("special", request)) }
    fun explore(q: Int, r: Int) = work { publish(engine("explore", JSONObject().put("q", q).put("r", r))) }
    fun focus(id: String) = work { publish(engine("focus", JSONObject().put("id", id)), "quests") }
    fun tool(name: String, args: JSONObject, reason: String) = work {
        val result = engine("tool", JSONObject().put("name", name).put("args", args).put("reason", reason))
        if (result.has("action")) runAction(result.getString("action"), result.getJSONObject("options")) else publish(result.getJSONObject("view"), "inventory")
    }
    fun reportError(message: String) { mutable.update { it.copy(error = message) } }
    override fun onCleared() {
        turnJob?.cancel()
        executor.execute { runtime?.close() }
        // Closing the executor accepts already queued cleanup; no cross-thread QuickJS calls.
        dispatcher.close()
    }
}
