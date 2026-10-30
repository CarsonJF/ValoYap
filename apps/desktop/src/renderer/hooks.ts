import { useEffect, useRef, useState } from "react";
import { pickDefaultOutput, type AppState, type OutputDevice } from "@valoyap/shared";
import type { ValoYapApi } from "../preload";
import { mockApi } from "./mock";

const params = new URLSearchParams(location.search);
export const api: ValoYapApi = (window as any).valoyap ?? mockApi;
export const isMock = !(window as any).valoyap || params.has("mock");

export function useAppState(): AppState | null {
  const [s, setS] = useState<AppState | null>(null);
  useEffect(() => {
    let alive = true;
    api.getState().then((st) => alive && setS(st));
    const off = api.onState((st) => setS(st));
    return () => {
      alive = false;
      off();
    };
  }, []);
  return s;
}

/** Plays clips on request from the main process, to a specific output device via setSinkId. */
export function useAudioBridge(): void {
  const el = useRef<HTMLAudioElement | null>(null);
  const cur = useRef<number | null>(null);
  useEffect(() => {
    const a = (el.current = new Audio());
    const finish = (error?: string) => {
      if (cur.current === null) return;
      const id = cur.current;
      cur.current = null;
      api.audioEnded(id, error);
    };
    a.onended = () => finish();
    a.onerror = () => finish(`Cannot play audio (${a.error?.message ?? "decode error"})`);
    a.onplaying = () => cur.current !== null && api.audioStarted(cur.current, Math.round((a.duration || 0) * 1000));
    const offPlay = api.onAudioPlay(async ({ id, url, gain, deviceId }) => {
      cur.current = id;
      try {
        if (a.setSinkId) await a.setSinkId(deviceId ?? "");
      } catch (e) {
        // device vanished: fall back to the system default rather than failing silently
        try {
          await a.setSinkId("");
        } catch {}
      }
      a.src = url;
      a.volume = Math.min(1, Math.max(0, gain));
      a.play().catch((e) => finish(String(e?.message ?? e)));
    });
    const offStop = api.onAudioStop(() => {
      a.pause();
      finish();
    });
    return () => {
      offPlay();
      offStop();
      a.pause();
    };
  }, []);
}

export function useOutputDevices(): OutputDevice[] {
  const [devs, setDevs] = useState<OutputDevice[]>([]);
  useEffect(() => {
    const md = navigator.mediaDevices;
    if (!md?.enumerateDevices) return;
    const load = async () => {
      const all = await md.enumerateDevices();
      setDevs(all.filter((d) => d.kind === "audiooutput").map((d) => ({ deviceId: d.deviceId, label: d.label || d.deviceId })));
    };
    void load();
    md.addEventListener("devicechange", load);
    return () => md.removeEventListener("devicechange", load);
  }, []);
  return devs;
}

/** Re-render ~30fps while a clip is playing, returning 0..1 progress. */
export function useProgress(startedAt: number | null, durationMs: number | null): number {
  const [p, setP] = useState(0);
  useEffect(() => {
    if (!startedAt || !durationMs) return setP(0);
    let raf = 0;
    const tick = () => {
      setP(Math.min(1, (Date.now() - startedAt) / durationMs));
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [startedAt, durationMs]);
  return p;
}

/** Choose the default device (Wave Link first) once, and re-map by label if ids change. */
export function useDefaultDevice(state: AppState | null, devices: OutputDevice[]): void {
  const done = useRef(false);
  useEffect(() => {
    if (!state || !devices.length || done.current) return;
    const { outputDeviceId, outputDeviceLabel } = state.config.audio;
    if (outputDeviceId && devices.some((d) => d.deviceId === outputDeviceId)) return void (done.current = true);
    const byLabel = outputDeviceLabel ? devices.find((d) => d.label === outputDeviceLabel) : null;
    const pick = byLabel ?? (outputDeviceId ? null : pickDefaultOutput(devices));
    if (pick) void api.patchConfig({ audio: { outputDeviceId: pick.deviceId, outputDeviceLabel: pick.label } });
    done.current = true;
  }, [state, devices]);
}
