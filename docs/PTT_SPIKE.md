# PTT spike: does Valorant accept a synthetic push-to-talk press?

**Status: RESULT PENDING. Needs a manual test by Carson in a custom game or The Range.** I (the agent that built this) cannot run Valorant, so nothing below is claimed as verified.

## The question

ValoYap wants to hold the team-voice PTT key while a clip plays, so teammates hear it. Valorant (and Vanguard, its anti-cheat) might ignore keyboard events that Windows marks as *injected* (`LLKHF_INJECTED` in a low-level hook, `LLMHF_INJECTED` for mouse). If so, the synthetic press never reaches the voice-chat code and the clip plays only into the mic bus with PTT closed, so nobody hears it.

## Method

`SendInput` is the documented Win32 API for synthesizing input; macro keyboards, AutoHotkey, accessibility tools and Stream Deck's own Hotkey action all use it or an equivalent driver path. ValoYap only ever sends the single user-configured PTT key (down, then up). It does not touch the game process, memory, or any game API.

Three variants are tested because games differ in how they read keys:

| # | Method | Why |
|---|--------|-----|
| 1 | `SendInput` + `KEYEVENTF_SCANCODE` (wVk = 0) | Most games read hardware scan codes / Raw Input. **ValoYap's default (`inputMethod: "scancode"`).** |
| 2 | `SendInput` with virtual-key (`wVk`) | Fallback for apps that only look at VK messages (`inputMethod: "vk"`). |
| 3 | legacy `keybd_event` with scan code | Older API; goes through the same kernel path, included as a sanity check. |

Extended keys (right Ctrl/Alt, arrows, Insert/Delete/Home/End/PgUp/PgDn, numpad `/`) set `KEYEVENTF_EXTENDEDKEY`. Mouse side buttons (Mouse 4/5) use `MOUSEEVENTF_XDOWN/XUP`.

## How to run it (about 5 minutes)

1. In Valorant: **Settings > Audio > Voice Chat**. Set *Party Voice Chat* and *Team Voice Chat* input mode to **Push to Talk**, and bind the PTT key to something simple, e.g. `V` (or an unused key like `F13` to avoid conflicts).
2. Start a **Custom game** (or join The Range with a friend/second account in your party). You need to see the *speaking indicator* next to your name in the party/team list, or have a friend tell you whether they hear you.
3. Open PowerShell and run (no install needed):

   ```powershell
   cd <repo>\tools\ptt-spike
   powershell -ExecutionPolicy Bypass -File .\PttSpike.ps1 -Key V
   ```

   Optional first sanity check: open Notepad and add `-Control`; it taps the key in the active window so you can confirm the script injects at all.
4. For each of the three trials the script counts down 5 seconds (alt-tab into Valorant), holds the key for 4 seconds, then releases it and asks whether the speaking indicator lit. Speak or play any sound into your mic during the hold; the indicator or your friend's report is what counts.
5. Also try the **in-app test**: ValoYap > Settings > PTT key > **Test hold (2s)**. This uses the real production code path (Node + `koffi` + `SendInput`) rather than PowerShell. If PowerShell works but the app doesn't (or vice versa), that's a bug worth knowing about.
6. If Valorant runs **elevated** (check Task Manager > Details > "Elevated"), Windows UIPI blocks injection from a non-elevated process; re-run the script/app as Administrator and note that.
7. Fill in the table below and commit it.

## Results (fill in)

| Date | Valorant build | Key | Method | Elevated? | Indicator lit / heard? | Notes |
|------|----------------|-----|--------|-----------|------------------------|-------|
| _pending_ | | | 1 scancode | | | |
| _pending_ | | | 2 vk | | | |
| _pending_ | | | 3 keybd_event | | | |
| _pending_ | | | in-app test | | | |

**Overall verdict:** _PENDING_ (accepted / ignored / works only with method N / needs elevation)

Also worth checking, since it affects design: does a **real** press of the same key still work *while* ValoYap is holding the synthetic one (it should; it's just a second down event), and does the key get stuck if you kill ValoYap mid-clip? (ValoYap releases the key in `finally`, on stop, and on app quit, but a hard kill from Task Manager cannot run cleanup; tap the real key once to clear it.)

## Safety behaviour already built in

- The key is released in a `finally` block, on Stop, on app exit, and a 60 s watchdog stops audio (and thus releases) if the audio engine hangs.
- Per-clip cooldown (default 4 s) and a volume cap; see README "Safety".
- Only one clip at a time. There is no ranked toggle by design.

## Two supported paths

### A. Synthetic PTT (default, `ptt.mode = "synthetic"`)

ValoYap holds the key itself: **key down -> pre-roll (default 120 ms) -> audio -> tail (default 150 ms) -> key up**. Zero extra Stream Deck setup. Works if the spike says Valorant accepts it.

### B. External PTT (`ptt.mode = "external"`), if synthetic input is ignored

ValoYap plays the clip and does **not** touch the keyboard. The Stream Deck (a real USB HID path as far as Windows is concerned when it triggers hotkeys through its own driver) presses PTT. Build the key as a **Multi Action** in the Stream Deck app:

1. **Hotkey** action: your PTT key (Stream Deck's Hotkey action presses and releases; if your PTT needs a hold, use a *Hotkey Switch* or the *Key Hold* mode where your Stream Deck version offers it, and end the sequence with a second action that releases it).
2. **Delay** ~100 ms (this plays the role of the pre-roll).
3. **ValoYap > Clip** action (plays the clip).
4. **Delay** for the clip length + ~150 ms, then release the PTT key.

Because a Multi Action key can't know the clip length, this path is clunkier; the cleaner variant is setting Valorant's team voice to **Toggle to talk** if offered (or "Open mic"), but that changes how you play, so path A is strongly preferred. The mode switch lives in Settings > PTT > Mode.

If Valorant accepts neither (a hardware-level macro keyboard or an Arduino HID device would still work, and is out of scope for this repo), the fallback is to leave PTT bound to a mouse side button or a spare keyboard key and press it yourself while the clip plays.
