// Captures docs/screens/*.png from the renderer running on the mock API (invented clips, no Riot art).
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const out = path.resolve(__dirname, "../../../docs/screens");
const index = path.resolve(__dirname, "../dist/renderer/index.html");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(win, name) {
  await wait(900); // let the one-shot slide-in finish
  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(out, name), img.toPNG());
  console.log("wrote", name);
}
const run = (win, js) => win.webContents.executeJavaScript(js);

app.whenReady().then(async () => {
  fs.mkdirSync(out, { recursive: true });
  const win = new BrowserWindow({ width: 1280, height: 800, show: true, useContentSize: true, backgroundColor: "#0f1923", webPreferences: { backgroundThrottling: false } });
  const load = async (q) => { await win.loadURL(`file:///${index.replace(/\\/g, "/")}?mock=1${q}`); await wait(500); };

  await load("");
  await shot(win, "agent-select-voice-lines.png");

  // playing state (progress bar mid-way)
  await run(win, `document.querySelector('.row:nth-child(2) .icon-btn:last-child').click()`);
  await wait(1200);
  await shot(win, "playing.png");

  await run(win, `window.__mock.setDetection({ state: "IN_MATCH", selection: null })`);
  await load("&tab=mine");
  await shot(win, "my-clips.png");

  await load("&tab=settings");
  await shot(win, "settings.png");

  await load("");
  await run(win, `window.__mock.empty(true)`);
  await shot(win, "empty-state.png");

  app.quit();
});
