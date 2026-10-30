import path from "node:path";

export interface AppPaths {
  root: string;
  config: string;
  cache: string;
  /** Imported/extracted game voice lines: voicelines/{agent|shared}/*.wav */
  voicelines: string;
  /** User clips: clips/{agent|shared}/*.mp3 */
  clips: string;
  logs: string;
}

export function appPaths(appData = process.env.APPDATA ?? ""): AppPaths {
  const root = path.join(appData, "ValoYap");
  return {
    root,
    config: path.join(root, "config.json"),
    cache: path.join(root, "cache"),
    voicelines: path.join(root, "voicelines"),
    clips: path.join(root, "clips"),
    logs: path.join(root, "logs"),
  };
}

export function shooterGameLog(localAppData = process.env.LOCALAPPDATA ?? ""): string {
  return path.join(localAppData, "VALORANT", "Saved", "Logs", "ShooterGame.log");
}
