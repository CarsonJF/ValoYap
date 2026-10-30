import { useState, type ReactNode } from "react";
import type { AppState } from "@valoyap/shared";
import { api } from "./hooks";
import { Check, Slider } from "./ui";

function Row({ label, desc, children }: { label: string; desc?: string; children: ReactNode }) {
  return (
    <div className="srow">
      <div>{label}{desc && <span className="d">{desc}</span>}</div>
      <div>{children}</div>
    </div>
  );
}

function Num({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (v: number) => void; label: string }) {
  return <input className="num-in" type="number" aria-label={label} min={min} max={max} value={value}
    onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, Math.round(n)))); }} />;
}

function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return <div className="seg">{options.map(([v, l]) => <button key={v} className={v === value ? "on" : ""} onClick={() => onChange(v)}>{l}</button>)}</div>;
}

export function Settings({ state }: { state: AppState }) {
  const c = state.config;
  const [pttMsg, setPttMsg] = useState("");
  return (
    <div className="settings slide-in">
      <h4>Playback</h4>
      <Row label="Cooldown per clip" desc="Milliseconds before the same clip can fire again."><Num label="Cooldown" min={0} max={60000} value={c.audio.cooldownMs} onChange={(v) => void api.patchConfig({ audio: { cooldownMs: v } })} /></Row>
      <Row label="Volume cap" desc="Final gain never exceeds this, whatever the sliders say.">
        <Slider label="Volume cap" min={0.05} max={1} value={c.audio.volumeCap} onChange={(v) => void api.patchConfig({ audio: { volumeCap: v } })} />
      </Row>
      <Row label="Include shared clips" desc="Append the shared folder after each agent's clips."><Check label="Include shared" on={c.clips.includeShared} onChange={(v) => void api.patchConfig({ clips: { includeShared: v } })} /></Row>

      <h4>Agent detection</h4>
      <Row label="Mode" desc="Manual keeps the agent you pick in the strip below.">
        <Seg value={c.agent.manualAgentId ? "manual" : "auto"} options={[["auto", "Auto"], ["manual", "Manual"]]}
          onChange={(v) => { if (v === "auto") void api.setManualAgent(null); }} />
      </Row>

      <h4>Push-to-talk</h4>
      <Row label="Press PTT for me" desc="Hold the key while a clip plays."><Check label="PTT enabled" on={c.ptt.enabled} onChange={(v) => void api.patchConfig({ ptt: { enabled: v } })} /></Row>
      <Row label="Who presses the key" desc="External: Stream Deck / you hold PTT; ValoYap only plays audio.">
        <Seg value={c.ptt.mode} options={[["synthetic", "ValoYap"], ["external", "External"]]} onChange={(v) => void api.patchConfig({ ptt: { mode: v } })} />
      </Row>
      <Row label="Input method" desc="Try Virtual-key if Valorant ignores scancodes."><Seg value={c.ptt.inputMethod} options={[["scancode", "Scancode"], ["vk", "Virtual-key"]]} onChange={(v) => void api.patchConfig({ ptt: { inputMethod: v } })} /></Row>
      <Row label="Pre-roll (ms)" desc="Key down this long before audio starts."><Num label="Pre-roll" min={0} max={1000} value={c.ptt.preRollMs} onChange={(v) => void api.patchConfig({ ptt: { preRollMs: v } })} /></Row>
      <Row label="Tail (ms)" desc="Key stays down this long after audio ends."><Num label="Tail" min={0} max={1000} value={c.ptt.tailMs} onChange={(v) => void api.patchConfig({ ptt: { tailMs: v } })} /></Row>
      <Row label="Test" desc={pttMsg || "Holds the PTT key for 2 seconds (focus a text field elsewhere first)."}>
        <button className="btn" onClick={async () => setPttMsg(await api.pttTest())}>Test hold (2s)</button>
      </Row>

      <h4>Stream Deck</h4>
      <Row label="Bridge" desc={`ws://127.0.0.1:${c.streamDeck.port} · ${state.sdClients > 0 ? `${state.sdClients} client(s) connected` : "no plugin connected"}`}><span className="muted">Local only</span></Row>

      <h4>Folders</h4>
      <Row label="Voice lines"><button className="btn" onClick={() => void api.openFolder("voicelines")}>Open</button></Row>
      <Row label="My clips"><button className="btn" onClick={() => void api.openFolder("clips")}>Open</button></Row>
      <Row label="Config file"><button className="btn" onClick={() => void api.openFolder("config")}>Show</button></Row>
      <Row label="Rescan" desc={state.unknownFolders.length ? `Unrecognised folders: ${state.unknownFolders.join(", ")}` : undefined}><button className="btn" onClick={() => void api.rescan()}>Rescan</button></Row>
    </div>
  );
}
