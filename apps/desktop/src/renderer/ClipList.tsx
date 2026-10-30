import { useState } from "react";
import type { AppState, ResolvedClip } from "@valoyap/shared";
import { api, useProgress } from "./hooks";
import { Check, Icon, Slider } from "./ui";

type Source = "voiceline" | "user";

function Row({ clip, playing, cooling, first, last, state }: { clip: ResolvedClip; playing: boolean; cooling: boolean; first: boolean; last: boolean; state: AppState }) {
  const [editing, setEditing] = useState(false);
  const p = useProgress(playing ? state.playback.startedAt : null, playing ? state.playback.durationMs : null);
  const phase = playing ? state.playback.phase : "idle";
  const commit = (v: string) => {
    setEditing(false);
    if (v.trim() && v.trim() !== clip.title) void api.setClip(clip.id, { title: v.trim() });
  };
  return (
    <div className={`row ${clip.enabled ? "" : "off"} ${playing ? "playing" : ""} ${cooling ? "cool" : ""}`} data-playing={playing}>
      <div className="num">{clip.enabled ? clip.key : "–"}</div>
      {editing ? (
        <input className="rename" autoFocus defaultValue={clip.title} maxLength={80}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") commit(e.currentTarget.value); if (e.key === "Escape") setEditing(false); }} />
      ) : (
        <div className="title" title="Double-click to rename" onDoubleClick={() => setEditing(true)}>{clip.title}</div>
      )}
      <div className="tag">{playing && phase === "preroll" ? "PTT…" : clip.agentKey === "shared" ? "Shared" : ""}</div>
      <Slider label={`Volume for ${clip.title}`} value={clip.volume} onChange={(v) => void api.setClip(clip.id, { volume: v })} />
      <Check on={clip.enabled} label={`Enable ${clip.title}`} onChange={(v) => void api.setClip(clip.id, { enabled: v })} />
      <button className="icon-btn" aria-label="Move up" disabled={first} onClick={() => void api.moveClip(clip.id, -1)}>{Icon.up}</button>
      <button className="icon-btn" aria-label="Move down" disabled={last} onClick={() => void api.moveClip(clip.id, 1)}>{Icon.down}</button>
      <button className="icon-btn" aria-label={playing ? "Stop" : "Play"} disabled={!clip.enabled} onClick={() => void (playing ? api.stop() : api.play(clip.id))}>{playing ? Icon.stop : Icon.play}</button>
      {playing && phase === "playing" && <div className="bar" style={{ ["--p" as any]: p }} />}
    </div>
  );
}

export function ClipList({ state, source }: { state: AppState; source: Source }) {
  const list = state.clips.filter((c) => c.source === source);
  const agentName = state.agents.find((a) => a.uuid === state.effectiveAgentId)?.name ?? "shared";
  const dir = source === "user" ? state.paths.clips : state.paths.voicelines;
  const enabled = list.filter((c) => c.enabled).length;
  const rej = state.playback.lastRejected;

  return (
    <>
      <div className="toolbar">
        <span className="hint">
          {enabled}/{list.length} enabled{rej?.reason === "cooldown" ? " · cooldown" : ""}
        </span>
        {source === "voiceline" && <button className="btn" onClick={() => void api.importFolder()}>Import folder</button>}
        <button className="btn" onClick={() => void api.addFiles(source)}>Add files</button>
        <button className="btn" onClick={() => void api.openFolder(source === "user" ? "clips" : "voicelines")}>Open folder</button>
      </div>
      {list.length === 0 ? (
        <div className="empty slide-in">
          <h3>{source === "voiceline" ? "No voice lines yet" : "No clips yet"}</h3>
          {source === "voiceline" ? (
            <>
              ValoYap does not ship or download Riot's audio, and the public asset API no longer provides agent voice lines.
              Drop your own extracted files (.wav, .mp3, .ogg, .flac) into <code>{dir}\{state.agentFolder}</code>, or use <b>Import folder</b>.
              A folder of agent sub-folders (<code>Jett\</code>, <code>Sova\</code>, <code>shared\</code>) is imported as-is.
            </>
          ) : (
            <>Add your own clips for {agentName === "shared" ? "all agents" : agentName}: drop files into <code>{dir}\{state.agentFolder}</code>. Files in <code>shared</code> appear for every agent.</>
          )}
          <div className="actions">
            <button className="btn primary" onClick={() => void (source === "voiceline" ? api.importFolder() : api.addFiles("user"))}>{source === "voiceline" ? "Import folder" : "Add files"}</button>
            <button className="btn" onClick={() => void api.openFolder(source === "user" ? "clips" : "voicelines")}>Open folder</button>
          </div>
        </div>
      ) : (
        <div className="list slide-in" key={state.effectiveAgentId ?? "none"}>
          {list.map((c, i) => (
            <Row key={c.id} clip={c} state={state} first={i === 0} last={i === list.length - 1}
              playing={state.playback.clipId === c.id && state.playback.phase !== "idle"}
              cooling={rej?.clipId === c.id && rej.reason === "cooldown"} />
          ))}
        </div>
      )}
    </>
  );
}
