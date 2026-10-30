import WebSocket from "ws";
import type { SdCommand, SdStateMessage } from "@valoyap/shared";

export interface BridgeEvents {
  onState(msg: SdStateMessage): void;
  onStatus(connected: boolean): void;
}

/** Auto-reconnecting client for the ValoYap desktop app's localhost WebSocket. */
export class Bridge {
  private ws?: WebSocket;
  private timer?: NodeJS.Timeout;
  private closed = false;
  private attempt = 0;

  constructor(private port: number, private version: string, private ev: BridgeEvents) {}

  start(): void {
    this.closed = false;
    this.connect();
  }

  stop(): void {
    this.closed = true;
    clearTimeout(this.timer);
    this.ws?.close();
  }

  send(cmd: SdCommand): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(cmd));
  }

  private connect(): void {
    // No Origin header is sent: the desktop app rejects browser-originated connections.
    const ws = (this.ws = new WebSocket(`ws://127.0.0.1:${this.port}`));
    ws.on("open", () => {
      this.attempt = 0;
      this.ev.onStatus(true);
      this.send({ type: "hello", version: this.version });
    });
    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg?.type === "state") this.ev.onState(msg as SdStateMessage);
      } catch {
        /* ignore malformed frames */
      }
    });
    const lost = () => {
      if (this.ws !== ws) return;
      this.ev.onStatus(false);
      if (this.closed) return;
      this.timer = setTimeout(() => this.connect(), Math.min(5000, 500 * 2 ** this.attempt++));
    };
    ws.on("close", lost);
    ws.on("error", () => {
      /* 'close' follows; reconnect handled there */
    });
  }
}
