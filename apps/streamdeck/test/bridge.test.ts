import { afterEach, describe, expect, it } from "vitest";
import { WebSocketServer } from "ws";
import { Bridge } from "../src/bridge";

let wss: WebSocketServer | undefined;
let bridge: Bridge | undefined;
afterEach(() => { bridge?.stop(); wss?.close(); });

const until = async (f: () => boolean, ms = 3000) => { const t = Date.now(); while (!f()) { if (Date.now() - t > ms) throw new Error("timeout"); await new Promise((r) => setTimeout(r, 20)); } };

describe("Bridge", () => {
  it("says hello, receives state, sends play, and reconnects", async () => {
    const received: any[] = [];
    wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
    await new Promise((r) => wss!.once("listening", r));
    const port = (wss.address() as any).port;
    wss.on("connection", (s, req) => {
      expect(req.headers.origin).toBeUndefined();
      s.on("message", (d) => received.push(JSON.parse(d.toString())));
      s.send(JSON.stringify({ type: "state", slots: [] }));
    });
    const states: any[] = []; const status: boolean[] = [];
    bridge = new Bridge(port, "9.9", { onState: (m) => states.push(m), onStatus: (c) => status.push(c) });
    bridge.start();
    await until(() => states.length === 1);
    expect(received[0]).toEqual({ type: "hello", version: "9.9" });
    bridge.send({ type: "play", clipId: "x" });
    await until(() => received.length === 2);
    expect(received[1]).toEqual({ type: "play", clipId: "x" });
    wss.clients.forEach((c) => c.terminate());
    await until(() => states.length === 2, 5000); // reconnected and got a fresh state
    expect(status).toContain(false);
  });
});
