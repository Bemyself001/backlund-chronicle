import { useRef, useState } from "react";
import Welcome from "./components/Welcome.jsx";
import CharacterCreation from "./components/CharacterCreation.jsx";
import GameScreen from "./components/GameScreen.jsx";
import ApiSettings from "./components/ApiSettings.jsx";
import PromptEditor from "./components/PromptEditor.jsx";
import SaveManager from "./components/SaveManager.jsx";
import { createInitialGame, DEFAULT_SYSTEM_PROMPT, migrateSystemPrompt } from "./data/defaults.js";
import { executeToolCalls } from "./engine/tools.js";
import { loadApiSettings, requestAI, saveApiSettings } from "./services/api.js";
import { buildContext, updateMemory } from "./services/memory.js";
import { mockResponse } from "./services/mock.js";
import { deleteSave, exportSave, importSave, listSaves, loadGame, saveGame } from "./services/storage.js";
import { makeId } from "./utils/id.js";

function advanceTime(value, minutes = 12) {
  const match = value.match(/(\d{1,2}):(\d{2})/);
  if (!match) return value;
  const total = Number(match[1]) * 60 + Number(match[2]) + minutes;
  const formatted = `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  return value.replace(match[0], formatted);
}

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
  const [error, setError] = useState("");
  const controllerRef = useRef(null);
  const busyRef = useRef(false);
  const lastActionRef = useRef("");
  const refreshSaves = () => setSaves(listSaves());

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

  const runTurn = async (action) => {
    if (!game || busyRef.current || !action.trim()) return;
    busyRef.current = true; lastActionRef.current = action; setLoading(true); setError(""); setStreamText("");
    const controller = new AbortController(); controllerRef.current = controller;
    try {
      const messages = buildContext(game, action, prompt);
      const response = settings.mockMode ? await mockResponse(game, action, controller.signal, setStreamText) : await requestAI(settings, messages, controller.signal, setStreamText);
      const execution = executeToolCalls(game, response.toolCalls);
      const memory = updateMemory(execution.game, action, response.narrative, response.memoryNotes);
      const next = {
        ...execution.game, ...memory, turn: game.turn + 1, worldTime: advanceTime(game.worldTime), choices: response.choices,
        worldEvents: [...game.worldEvents, ...response.worldEvents.map((text) => ({ id: makeId("event"), turn: game.turn + 1, text }))].slice(-40),
        changeLog: [...game.changeLog, ...execution.logs].slice(-100),
        hiddenDanger: { ...game.hiddenDanger, stage: Math.min(5, game.hiddenDanger.stage + (response.choices.some((choice) => choice.risk === "high") ? 1 : 0)) },
      };
      commitGame(next); setStreamText("");
    } catch (err) {
      setError(err.name === "AbortError" ? "生成已由你中止；游戏状态没有改变。" : err.message || "未知错误，请重试本轮。");
    } finally { setLoading(false); busyRef.current = false; controllerRef.current = null; }
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
    {screen === "game" && game && <GameScreen game={game} loading={loading} streamText={streamText} error={error} onAction={runTurn} onAbort={() => controllerRef.current?.abort()} onRetry={() => runTurn(lastActionRef.current)} onLocalTool={runLocalTool} onOpenApi={() => setModal("api")} onOpenPrompt={() => setModal("prompt")} onOpenSaves={() => { refreshSaves(); setModal("saves"); }} onHome={() => setScreen("welcome")} />}
    {modal === "api" && <ApiSettings settings={settings} onSave={handleSettingsSave} onClose={() => setModal(null)} />}
    {modal === "prompt" && <PromptEditor value={prompt} onSave={handlePromptSave} onClose={() => setModal(null)} />}
    {modal === "saves" && game && <SaveManager saves={saves} game={game} onSave={saveSlot} onLoad={loadSlot} onDelete={removeSlot} onExport={exportSave} onImport={handleImport} onClose={() => setModal(null)} />}
  </>;
}
