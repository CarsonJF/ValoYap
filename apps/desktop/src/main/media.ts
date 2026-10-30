import { net, protocol } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { CACHE_SCHEME } from "@valoyap/core";

export const MEDIA_SCHEME = "valoyap-media";

/** Must run before app.ready. */
export function registerSchemes(): void {
  protocol.registerSchemesAsPrivileged(
    [CACHE_SCHEME, MEDIA_SCHEME].map((scheme) => ({
      scheme,
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true },
    })),
  );
}

export const mediaUrl = (absPath: string) => `${MEDIA_SCHEME}://clip/${encodeURIComponent(absPath)}`;

const inside = (root: string, p: string) => {
  const rel = path.relative(root, p);
  return !!rel && !rel.startsWith("..") && !path.isAbsolute(rel);
};

/** Serves the runtime cache (agent art) and clip files, restricted to ValoYap's own folders. */
export function installProtocols(dirs: { cache: string; voicelines: string; clips: string }): void {
  protocol.handle(CACHE_SCHEME, (req) => {
    const u = new URL(req.url);
    const file = path.join(dirs.cache, u.hostname, decodeURIComponent(u.pathname));
    if (!inside(dirs.cache, file)) return new Response("forbidden", { status: 403 });
    return net.fetch(pathToFileURL(file).toString(), { headers: req.headers });
  });
  protocol.handle(MEDIA_SCHEME, (req) => {
    const file = path.normalize(decodeURIComponent(new URL(req.url).pathname.slice(1)));
    if (!inside(dirs.voicelines, file) && !inside(dirs.clips, file)) return new Response("forbidden", { status: 403 });
    return net.fetch(pathToFileURL(file).toString(), { headers: req.headers });
  });
}
