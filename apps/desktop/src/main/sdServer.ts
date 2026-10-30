import { WebSocketServer, type WebSocket } from "ws";
import type { SdCommand, SdStateMessage } from "@valoyap/shared";

/**
 * Localhost-only WebSocket for the Stream Deck plugin.
 * Browser pages can't connect: any connection that carries an Origin header is refused.
 */
export class SdServer {
  private wss: WebSocketServer | null = null;
  private last: SdStateMessage | null = null;

  constructor(private onCommand: (cmd: SdCommand) => void, private onClients: (n: number) => void) {}

  start(port: number): void {
    this.stop();
    const wss = new WebSocketServer({
      host: "127.0.0.1",
      port,
      verifyClient: (info: { origin?: string }) => !info.origin,
    });
    wss.on("connection", (ws: WebSocket) => {
      this.onClients(wss.clients.size);
      if (this.last) ws.send(JSON.stringify(this.last));
      ws.on("message", (data) => {
        try {
          const cmd = JSON.parse(data.toString()) as SdCommand;
          if (cmd && typeof cmd.type === "string") this.onCommand(cmd);
        } catch {
          /* ignore malformed */
        }
      });
      ws.on("close", () => this.onClients(wss.clients.size));
    });
    wss.on("error", (e) => console.error("[sd] ws error", e.message));
    this.wss = wss;
  }

  broadcast(msg: SdStateMessage): void {
    this.last = msg;
    const text = JSON.stringify(msg);
    this.wss?.clients.forEach((c) => c.readyState === 1 && c.send(text));
  }

  stop(): void {
    this.wss?.close();
    this.wss = null;
  }
}
