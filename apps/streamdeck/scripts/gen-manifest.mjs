// Writes com.carsonjf.valoyap.sdPlugin/manifest.json (Profiles are derived from src/layout.ts so they cannot drift).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function manifest(devices, profilePath) {
  const act = (suffix, name, tooltip, visible) => ({
    UUID: `com.carsonjf.valoyap.${suffix}`, Name: name, Tooltip: tooltip, Icon: "imgs/actions/icon",
    VisibleInActionsList: visible, States: [{ Image: "imgs/actions/key" }], Controllers: ["Keypad"],
  });
  return {
    $schema: "https://schemas.elgato.com/streamdeck/plugins/manifest.json",
    SDKVersion: 2,
    UUID: "com.carsonjf.valoyap",
    Name: "ValoYap Soundboard",
    Version: "0.1.0.0",
    Author: "CarsonJF",
    Description: "Switches to the detected Valorant agent's soundboard. Requires the ValoYap desktop app.",
    Icon: "imgs/plugin/icon",
    Category: "ValoYap",
    CategoryIcon: "imgs/plugin/category",
    CodePath: "bin/plugin.js",
    Nodejs: { Version: "20", Debug: "disabled" },
    OS: [{ Platform: "windows", MinimumVersion: "10" }],
    Software: { MinimumVersion: "6.9" },
    Actions: [
      act("clip", "Clip", "Plays the clip bound to this key (the app fills it for the current agent).", true),
      act("prev", "Previous page", "Previous page of clips.", false),
      act("next", "Next page", "Next page of clips.", false),
      act("back", "Back", "Return to the previous profile.", false),
    ],
    Profiles: devices.map((d) => ({ Name: profilePath(d), DeviceType: d.deviceType, Readonly: false, DontAutoSwitchWhenInstalled: true, AutoInstall: true })),
  };
}
