# Architecture

```
ShooterGame.log ──tail──► LogParser ─► DetectionMachine ─► DetectionService ──(GET only)──► Riot local/GLZ APIs
                                                                  │
                                        AppState ◄────────────────┘
                                           │
        ┌──────────────────────────────────┼───────────────────────────────┐
        ▼                                  ▼                               ▼
  Electron renderer (React)        PlaybackController              Stream Deck bridge (ws, 127.0.0.1)
  agent select UI, settings        cooldown → PTT down →                    │
        ▲                          pre-roll → audio → tail → PTT up         ▼
        └── audio:play / audio:ended (IPC) ── <audio>.setSinkId(device)   Stream Deck plugin (Node, @elgato/streamdeck)
```

## Stack decision

**Electron + React + TypeScript** for the desktop app, **pnpm monorepo** with a shared types package.

- The machine this was built on has no Rust toolchain, which rules out Tauri without a large install. A Node/TS stack also lets the app, the Stream Deck plugin and the detection logic share one language and one `@valoyap/shared` package (config schema, protocol, key table, clip resolution), so the two processes cannot drift apart.
- Chromium's `HTMLMediaElement.setSinkId()` and `enumerateDevices()` give real, device-targeted audio output (needed to send clips to a Wave Link virtual device) with no native audio code.
- Push-to-talk needs `SendInput`; `koffi` calls it directly from Node (scancode, virtual-key, extended keys, mouse X1/X2) with no compile step. The key-to-input mapping is pure and unit-tested.
- Cost: a bigger install than Tauri. Trade accepted; Tauri would be the choice if a Rust toolchain were already present.

Main and preload are bundled with esbuild to CommonJS (`koffi` external), the renderer with Vite.

## Packages

- `packages/shared` – `ConfigSchema` (zod, `version: 1`, `migrateConfig`), protocol types, key table, theme tokens, `resolveClips`/`reorder`, `pickDefaultOutput`. Pure, browser-safe.
- `packages/core` – Node only: log parser/tailer, `DetectionMachine`, `DetectionService`, `RiotClient`, `loadAgents`, clip scanner and watcher, `ConfigStore` (atomic writes, corrupt-file backup), `PlaybackController`, `WindowsKeyInjector`.
- `apps/desktop` – Electron main (IPC, protocols, audio engine, Stream Deck server), preload, renderer.
- `apps/streamdeck` – the plugin and its build/profile generator.

## Detection

1. `LogTailer` follows `ShooterGame.log` (handles truncation and file replacement). It is the only trigger: **no polling**.
2. `logParser` extracts `Transitioning from X to Y` game-flow events, the GLZ base URL, the player UUID, and `Pregame_SelectCharacter`/`Pregame_LockCharacter` lines.
3. `DetectionMachine` maps flow states to `MENU` / `AGENT_SELECT` / `IN_MATCH` (and `OFFLINE` when the game is not running; a process check runs every 5 s).
4. On a state change or a select/lock line, `DetectionService` (debounced 300 ms, stale results discarded by a generation counter) resolves the agent: Riot Client lockfile → port/password → `/entitlements/v1/token` → GLZ `/pregame/v1/players/{puuid}` → `/pregame/v1/matches/{id}`, then `/core-game/v1/players/{puuid}` → `/core-game/v1/matches/{id}`. Only the player's own `CharacterID` is read; UUID → name via valorant-api.com. Retries are bounded (0, 1, 2, 3, 5 s) and only for 404/400 while the match object is still being created.
5. The manual agent pick always overrides detection.

`getJson` is the only network primitive and it only issues GET. The self-signed local Riot Client certificate is accepted only for `127.0.0.1`.

## Playback and push-to-talk

`PlaybackController.play(clip)`: reject if the clip is on cooldown (default 4 s) → key down (if enabled and mode is synthetic) → wait pre-roll (default 120 ms) → ask the renderer to play at `min(masterVolume × clipVolume, volumeCap)` → on end wait the tail (default 150 ms) → key up. The key is released in a `finally`, on stop, on dispose/quit, and a 60 s watchdog stops runaway audio. In **external** mode ValoYap does not touch the keyboard at all (the Stream Deck or you hold PTT).

## Clips

Voice lines come from `%AppData%\ValoYap\voicelines\{Agent|shared}` and user clips from `%AppData%\ValoYap\clips\{Agent|shared}`; both are watched. Folder names resolve to an agent by normalised name (`KAY/O` → `kayo`) or UUID.

**Voice-line sourcing research.** The community API (valorant-api.com) returns `voiceLine: null` for agents, and the game's audio lives in Wwise `.wem`/`.bnk` banks inside Riot's `.pak` files. There is no stable, legitimate, redistributable source the app can download from, and Riot's audio must not be committed to a public repo. Therefore import is first-class: *Import folder*, *Add files*, drop-in folders, and a documented layout. Converting `.wem` to `.wav` is left to the user (Chromium cannot decode `.wem`).

Order: saved order if present, else voice lines, then user clips, then shared, natural-sorted. Per-clip `title`, `enabled`, `volume` overrides are stored per agent. Disabled clips get no key number and numbering skips them.

## Stream Deck

The plugin (SDK 3.0.4, Node 20, manifest `SDKVersion: 2`) connects as a WebSocket **client** to `ws://127.0.0.1:38120` and reconnects with backoff.

- App → plugin: `state { detection, agent{id,name,role,iconDataUrl?}, slots[{clipId,key,title}], playback, pttMode }`.
- Plugin → app: `hello`, `play{clipId}`, `stop`, `manualAgent{agentId|null}`.

Behaviour: when the effective agent becomes known in `AGENT_SELECT`/`IN_MATCH`, each connected supported device is switched once to `profiles/ValoYap Soundboard <device>` via `streamDeck.profiles.switchToProfile`. Keys are filled with `setImage` (generated SVG: number, title, red fill while playing) and `setTitle`. Layout is a pure function (`src/layout.ts`) shared by the runtime and the profile generator: the last three keys are Prev / Next / Back, the rest are Clip keys; paging is per device. Back calls `switchToProfile(deviceId)` with no name (previous profile) and suppresses re-switching until the agent changes. Leaving the match restores the previous profile.

`pnpm --filter @valoyap/streamdeck build` bundles the plugin, writes `manifest.json` (profile list derived from the layout table), generates flat PNG icons, and generates one `.streamDeckProfile` per device size. Nothing from Riot is used; the key images are generated SVG and the agent icon is only shown from runtime data.

Not handled: Pedal, Mobile, `+ XL`, Studio, Galleon and other devices have no bundled profile yet; the plugin simply does nothing for them.

## Security notes

Loopback-only listeners; Origin-bearing (browser) connections are refused; `valoyap-media://` serves only files under the voicelines and clips directories; `valoyap-cache://` serves only the cache directory; the renderer runs with `contextIsolation` and a restrictive CSP; no tokens are logged or persisted.

## Wave Link

Audio reaches Wave Link as an ordinary Windows output device (a virtual device it creates per channel). The optional Wave Link JSON-RPC control API (for per-channel gain/mute) is deliberately not implemented in this MVP.

## UI theme

Navy `#0f1923`, off-white `#ece8e1`, red `#ff4655` only for active/playing state and primary accents, muted grey-blue. Bebas Neue display plus Inter. Sharp corners, clipped-corner buttons, 1 px rules, HUD corner brackets, no gradients/glows/soft shadows, 8 px grid, animations play once and never loop (and are disabled under `prefers-reduced-motion`). Tokens live in `packages/shared/src/theme.ts` and `apps/desktop/src/renderer/styles.css`.
