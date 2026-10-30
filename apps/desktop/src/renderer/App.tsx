import { useState } from "react";
import { AgentPanel, AgentStrip, Footer, StatusBar } from "./Panels";
import { ClipList } from "./ClipList";
import { Settings } from "./Settings";
import { Hud } from "./ui";
import { useAppState, useAudioBridge, useDefaultDevice, useOutputDevices } from "./hooks";

type Tab = "voice" | "mine" | "settings";

export function App() {
  const state = useAppState();
  const devices = useOutputDevices();
  const [tab, setTab] = useState<Tab>(() => (new URLSearchParams(location.search).get("tab") as Tab) || "voice");
  useAudioBridge();
  useDefaultDevice(state, devices);
  if (!state) return null;
  const count = (s: string) => state.clips.filter((c) => c.source === s).length;
  return (
    <div className="app">
      <StatusBar state={state} />
      <div className="main">
        <AgentPanel state={state} />
        <Hud className="right-hud">
          <div className="right">
            <div className="tabs">
              <button className={`tab ${tab === "voice" ? "active" : ""}`} onClick={() => setTab("voice")}>Voice lines<small>{count("voiceline")}</small></button>
              <button className={`tab ${tab === "mine" ? "active" : ""}`} onClick={() => setTab("mine")}>My clips<small>{count("user")}</small></button>
              <button className={`tab ${tab === "settings" ? "active" : ""}`} onClick={() => setTab("settings")}>Settings</button>
            </div>
            <div className="content">
              {tab === "voice" && <ClipList state={state} source="voiceline" />}
              {tab === "mine" && <ClipList state={state} source="user" />}
              {tab === "settings" && <Settings state={state} />}
            </div>
            <Footer state={state} devices={devices} />
          </div>
        </Hud>
      </div>
      <AgentStrip state={state} />
      {state.lastError && <div className="toast">{state.lastError}</div>}
    </div>
  );
}
