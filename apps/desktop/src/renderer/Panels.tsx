import { useEffect, useState } from "react";
import { DETECTION_LABEL, keyForCode, type AppState, type OutputDevice } from "@valoyap/shared";
import { api } from "./hooks";
import { Hud, Monogram, Slider } from "./ui";

export function StatusBar({ state }: { state: AppState }) {
  const d = state.detection.state;
  const live = d === "AGENT_SELECT" || d === "IN_MATCH";
  return (
    <div className="titlebar">
      <div className="brand">VALO<b>YAP</b></div>
      <div className={`status ${live ? "live" : ""}`}>
        {state.mode !== "live" && <><span className="badge on">{state.mode.toUpperCase()}</span><span className="sep" /></>}
        <span className="dot" />
        <span>{DETECTION_LABEL[d]}</span>
        <span className="sep" />
        <span className="muted">Stream Deck {state.sdClients > 0 ? `connected (${state.sdClients})` : "offline"}</span>
      </div>
    </div>
  );
}

export function AgentPanel({ state }: { state: AppState }) {
  const agent = state.agents.find((a) => a.uuid === state.effectiveAgentId);
  const manual = state.config.agent.manualAgentId !== null;
  const sel = state.detection.selection;
  return (
    <Hud className="agent-hud">
      <div className="agent-panel">
        <div className="eyebrow">
          <span>{manual ? "Manual pick" : "Detected agent"}</span>
          {!manual && agent && sel && sel !== "none" && <span>{sel === "locked" ? "Locked" : "Hovering"}</span>}
        </div>
        <div className="portrait slide-in-l" key={agent?.uuid ?? "none"}>
          {agent?.portraitUrl ? <img src={agent.portraitUrl} alt="" /> : <div className="ph">{agent ? <Monogram name={agent.name} /> : "?"}</div>}
        </div>
        <div className={`agent-name slide-in-l ${agent ? "" : "none"}`} key={`n-${agent?.uuid ?? "none"}`}>{agent?.name ?? "No agent"}</div>
        <div className="agent-role"><i />{agent?.role ?? "Waiting for match"}</div>
      </div>
    </Hud>
  );
}

export function AgentStrip({ state }: { state: AppState }) {
  const manualId = state.config.agent.manualAgentId;
  return (
    <div className="strip">
      <button className={`btn auto ${manualId === null ? "on" : ""}`} onClick={() => void api.setManualAgent(null)} title="Follow detection">AUTO</button>
      {state.agents.map((a) => (
        <button key={a.uuid} title={a.name} aria-label={a.name}
          className={`agent-btn ${a.uuid === state.effectiveAgentId ? "active" : ""} ${a.uuid === manualId ? "manual" : ""}`}
          onClick={() => void api.setManualAgent(a.uuid)}>
          {a.iconUrl ? <img src={a.iconUrl} alt="" /> : <span className="mono">{a.name.slice(0, 1)}</span>}
        </button>
      ))}
    </div>
  );
}

function PttPicker({ state }: { state: AppState }) {
  const [listening, setListening] = useState(false);
  const key = state.config.ptt.key;
  useEffect(() => {
    if (!listening) return;
    const set = (code: string, label: string) => { setListening(false); void api.patchConfig({ ptt: { key: { code, label } } }); };
    const kd = (e: KeyboardEvent) => {
      e.preventDefault();
      if (e.code === "Escape") return setListening(false);
      if (e.code === "Delete" || e.code === "Backspace") { setListening(false); return void api.patchConfig({ ptt: { key: null } }); }
      const known = keyForCode(e.code);
      if (!known) return;
      set(e.code, known.label);
    };
    const md = (e: MouseEvent) => {
      if (e.button === 3) { e.preventDefault(); set("Mouse4", "Mouse 4"); }
      if (e.button === 4) { e.preventDefault(); set("Mouse5", "Mouse 5"); }
    };
    window.addEventListener("keydown", kd, true);
    window.addEventListener("mousedown", md, true);
    return () => { window.removeEventListener("keydown", kd, true); window.removeEventListener("mousedown", md, true); };
  }, [listening]);
  return (
    <div className="field">
      <label>Push-to-talk key</label>
      <button className={`keybtn ${listening ? "listening" : ""}`} onClick={() => setListening(!listening)}>
        {listening ? "PRESS A KEY · ESC CANCEL · DEL CLEAR" : key?.label ?? "NOT SET"}
      </button>
    </div>
  );
}

export function Footer({ state, devices }: { state: AppState; devices: OutputDevice[] }) {
  const a = state.config.audio;
  const known = devices.some((d) => d.deviceId === a.outputDeviceId);
  return (
    <div className="controls">
      <div className="field">
        <label>Output device</label>
        <div className="select">
          <select value={a.outputDeviceId ?? ""} onChange={(e) => {
            const d = devices.find((x) => x.deviceId === e.target.value);
            void api.patchConfig({ audio: { outputDeviceId: d?.deviceId ?? null, outputDeviceLabel: d?.label ?? null } });
          }}>
            <option value="">System default</option>
            {!known && a.outputDeviceId && <option value={a.outputDeviceId}>{a.outputDeviceLabel ?? "Missing device"} (unavailable)</option>}
            {devices.filter((d) => d.deviceId !== "default").map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label}</option>)}
          </select>
        </div>
      </div>
      <PttPicker state={state} />
      <div className="field">
        <label>Volume</label>
        <div className="vol">
          <Slider label="Master volume" value={a.volume} onChange={(v) => void api.patchConfig({ audio: { volume: v } })} />
          <output>{Math.round(a.volume * 100)}</output>
        </div>
      </div>
    </div>
  );
}
