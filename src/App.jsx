import { useRef, useState } from "react";
import Welcome from "./components/Welcome.jsx";
import CharacterCreation from "./components/CharacterCreation.jsx";
import GameScreen from "./components/GameScreen.jsx";
import ApiSettings from "./components/ApiSettings.jsx";
import PromptEditor from "./components/PromptEditor.jsx";
import SaveManager from "./components/SaveManager.jsx";
import { createInitialGame, DEFAULT_SYSTEM_PROMPT, migrateSystemPrompt } from "./data/defaults.js";
import { executeToolCalls } from "./engine/tools.js";
import { resolveTurnProgress } from "./engine/turn.js";
import { buildToolResultMessages, loadApiSettings, requestAIWithReasoningFallback, saveApiSettings } from "./services/api.js";
import { buildContext, updateMemory } from "./services/memory.js";
import { mockResponse } from "./services/mock.js";
import { deleteSave, exportSave, importSave, listSaves, loadGame, saveGame } from "./services/storage.js";
import { extractNarrativePreview } from "./services/streamPreview.js";
import { makeId } from "./utils/id.js";

export default function App() {
  const [screen, setScreen] = useState("welcome");
  const [game, setGame] = useState(null);
  const [settings, setSettings] = useState(loadApiSettings);
  const [prompt, setPrompt] = useState(() => {
    const saved = localStorage.getItem("mist-system-prompt");
    if (!saved) return DEFAULT_SYSTEM_PROMPT;
    const migrated = migrateSystemPrompt(saved);
    if (migrated !== saved) localStorage.setItem("mist-system-prompt", migrated);
    return migrated;
  });
  const [modal, setModal] = useState(null);
  const [saves, setSaves] = useState(listSaves);
  const [loading, setLoading] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [turnPhase, setTurnPhase] = useState("idle");
  const [error, setError] = useState("");
  const controllerRef = useRef(null);
  const busyRef = useRef(false);
  const lastActionRef = useRef("");
  const streamTimerRef = useRef(null);
  const pendingStreamRef = useRef("");
  const refreshSaves = () => setSaves(listSaves());

  const resetStreamPreview = () => {
    if (streamTimerRef.current) clearTimeout(streamTimerRef.current);
    streamTimerRef.current = null;
    pendingStreamRef.current = "";
    setStreamText("");
  };
  const queueStreamPreview = (rawContent) => {
    pendingStreamRef.current = extractNarrativePreview(rawContent);
    if (streamTimerRef.current) return;
    streamTimerRef.current = setTimeout(() => {
      setStreamText(pendingStreamRef.current);
      streamTimerRef.current = null;
    }, 40);
  };

  const commitGame = (next) => {
    const saved = saveGame(next);
    setGame(saved);
    refreshSaves();
  };
  const handleCreate = (character) => { const next = createInitialGame(character); commitGame(next); setScreen("game"); };
  const handleContinue = () => { const loaded = loadGame(); if (loaded) { setGame(loaded); setScreen("game"); } };
  const handleImport = async (file) => { const imported = await importSave(file); setGame(imported); refreshSaves(); setScreen("game"); };
  const handleSettingsSave = (next) => { setSettings(saveApiSettings(next)); };
  const handlePromptSave = (next) => { localStorage.setItem("mist-system-prompt", next); setPrompt(next); };

  const runTurn = async (action, options = {}) => {
    if (!game || busyRef.current || !action.trim()) return false;
    const selectedRisk = game.choices.find((choice) => choice.label === action)?.risk;
    busyRef.current = true; lastActionRef.current = action; setLoading(true); setTurnPhase(options.manualRetry ? "manualRetry" : "generating"); setError(""); resetStreamPreview();
    const controller = new AbortController(); controllerRef.current = controller;
    try {
      const messages = buildContext(game, action, prompt);
      const requestModel = (requestMessages, requestOptions = {}) => requestAIWithReasoningFallback(settings, requestMessages, controller.signal, queueStreamPreview, {
        ...requestOptions,
        onReasoningFallback: () => { resetStreamPreview(); setTurnPhase("reasoningRetry"); },
      });
      let response = settings.mockMode ? await mockResponse(game, action, controller.signal, queueStreamPreview) : await requestModel(messages);
      const proposedToolCalls = response.toolCalls;
      const toolReasoningContent = response.reasoningContent || "";
      setTurnPhase("validating");
      const execution = executeToolCalls(game, proposedToolCalls);
      if (!settings.mockMode && response.requiresToolFollowUp) {
        resetStreamPreview();
        setTurnPhase("finalizing");
        const followUpMessages = [...messages, ...buildToolResultMessages(proposedToolCalls, execution.results, toolReasoningContent)];
        response = await requestModel(followUpMessages, { disableTools: true });
      }
      const memory = updateMemory(execution.game, action, response.narrative, response.memoryNotes);
      const progress = resolveTurnProgress(execution.game, action, selectedRisk, proposedToolCalls, execution.results);
      const next = {
        ...execution.game, ...memory, turn: game.turn + 1, worldTime: progress.worldTime, choices: response.choices,
        worldEvents: [...game.worldEvents, ...response.worldEvents.map((text) => ({ id: makeId("event"), turn: game.turn + 1, text }))].slice(-40),
        changeLog: [...game.changeLog, ...execution.logs].slice(-100),
        hiddenDanger: progress.hiddenDanger,
      };
      resetStreamPreview(); commitGame(next);
      return true;
    } catch (err) {
      setError(err.name === "AbortError" ? "生成已由你中止；游戏状态没有改变。" : err.message || "未知错误，请重试本轮。");
      return false;
    } finally { resetStreamPreview(); setTurnPhase("idle"); setLoading(false); busyRef.current = false; controllerRef.current = null; }
  };

  const retryLastTurn = () => {
    const action = lastActionRef.current.trim();
    if (!action) { setError("没有可以重试的上一轮行动。请在输入框中描述新的行动。"); return Promise.resolve(false); }
    return runTurn(action, { manualRetry: true });
  };

  const runLocalTool = (name, args, reason) => {
    if (!game || loading) return;
    const execution = executeToolCalls({ ...game, turn: game.turn - 1 }, [{ id: makeId("local"), name, args, reason }]);
    commitGame({ ...execution.game, turn: game.turn, changeLog: [...game.changeLog, ...execution.logs].slice(-100) });
  };
  const saveSlot = (slotId, label) => { if (game) saveGame(game, slotId, label); refreshSaves(); };
  const loadSlot = (slotId) => { const loaded = loadGame(slotId); if (loaded) { setGame(loaded); setScreen("game"); setModal(null); } };
  const removeSlot = (slotId) => { deleteSave(slotId); refreshSaves(); };

  return <>
    <a className="skip-link" href="#main">跳到主要内容</a>
    {screen === "welcome" && <Welcome hasSave={saves.some((slot) => slot.slotId === "autosave")} apiSettings={settings} onNew={() => setScreen("create")} onContinue={handleContinue} onImport={handleImport} onApi={() => setModal("api")} />}
    {screen === "create" && <CharacterCreation onBack={() => setScreen("welcome")} onCreate={handleCreate} />}
    {screen === "game" && game && <GameScreen game={game} loading={loading} turnPhase={turnPhase} streamText={streamText} error={error} onAction={runTurn} onAbort={() => controllerRef.current?.abort()} onRetry={retryLastTurn} onLocalTool={runLocalTool} onOpenApi={() => setModal("api")} onOpenPrompt={() => setModal("prompt")} onOpenSaves={() => { refreshSaves(); setModal("saves"); }} onHome={() => setScreen("welcome")} />}
    {modal === "api" && <ApiSettings settings={settings} onSave={handleSettingsSave} onClose={() => setModal(null)} />}
    {modal === "prompt" && <PromptEditor value={prompt} onSave={handlePromptSave} onClose={() => setModal(null)} />}
    {modal === "saves" && game && <SaveManager saves={saves} game={game} onSave={saveSlot} onLoad={loadSlot} onDelete={removeSlot} onExport={exportSave} onImport={handleImport} onClose={() => setModal(null)} />}
  </>;
}
