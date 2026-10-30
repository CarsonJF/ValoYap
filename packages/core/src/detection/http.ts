import https from "node:https";

export class HttpError extends Error {
  constructor(public status: number, public url: string, public body: string) {
    super(`GET ${url} -> ${status}`);
  }
}

/**
 * The ONLY network primitive used for Riot endpoints, and it only does GET.
 * ValoYap never mutates game state; there is deliberately no post/put/delete here.
 * `insecureLocal` accepts the Riot Client's self-signed cert, but only for 127.0.0.1.
 */
export function getJson<T = any>(
  url: string,
  headers: Record<string, string> = {},
  opts: { insecureLocal?: boolean; timeoutMs?: number } = {},
): Promise<T> {
  const u = new URL(url);
  if (opts.insecureLocal && u.hostname !== "127.0.0.1") {
    return Promise.reject(new Error("insecureLocal is only allowed for 127.0.0.1"));
  }
  return new Promise((resolve, reject) => {
    const req = https.request(
      u,
      {
        method: "GET",
        headers,
        rejectUnauthorized: !opts.insecureLocal,
        timeout: opts.timeoutMs ?? 8000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          if ((res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300) {
            try {
              resolve(JSON.parse(body) as T);
            } catch (e) {
              reject(e);
            }
          } else reject(new HttpError(res.statusCode ?? 0, url, body));
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
}
