import { z } from "zod";

export const CONFIG_VERSION = 1;

export const PttKeySchema = z.object({
  /** KeyboardEvent.code, or "Mouse4"/"Mouse5". */
  code: z.string(),
  label: z.string(),
});
export type PttKey = z.infer<typeof PttKeySchema>;

export const ClipOverrideSchema = z.object({
  title: z.string().max(80).optional(),
  enabled: z.boolean().optional(),
  volume: z.number().min(0).max(1).optional(),
});
export type ClipOverride = z.infer<typeof ClipOverrideSchema>;

export const ConfigSchema = z.object({
  version: z.literal(CONFIG_VERSION),
  audio: z
    .object({
      outputDeviceId: z.string().nullable().default(null),
      /** Remembered label so a device can be re-found if the id changes. */
      outputDeviceLabel: z.string().nullable().default(null),
      volume: z.number().min(0).max(1).default(0.7),
      /** Hard ceiling on final gain (volume * clip volume). Voice-abuse safety. */
      volumeCap: z.number().min(0.05).max(1).default(0.8),
      cooldownMs: z.number().int().min(0).max(60000).default(4000),
    })
    .default({}),
  ptt: z
    .object({
      enabled: z.boolean().default(true),
      /** "synthetic": ValoYap presses the key. "external": Stream Deck / user presses it. */
      mode: z.enum(["synthetic", "external"]).default("synthetic"),
      key: PttKeySchema.nullable().default(null),
      preRollMs: z.number().int().min(0).max(1000).default(120),
      tailMs: z.number().int().min(0).max(1000).default(150),
      /** scancode is what most games read; vk is the fallback to try. */
      inputMethod: z.enum(["scancode", "vk"]).default("scancode"),
    })
    .default({}),
  clips: z
    .object({
      /** key = agent uuid or "shared"; value = clip id -> override */
      overrides: z.record(z.record(ClipOverrideSchema)).default({}),
      /** key = agent uuid or "shared"; value = ordered clip ids */
      order: z.record(z.array(z.string())).default({}),
      includeShared: z.boolean().default(true),
    })
    .default({}),
  agent: z
    .object({
      /** When set, overrides detection (manual pick). */
      manualAgentId: z.string().nullable().default(null),
    })
    .default({}),
  streamDeck: z
    .object({
      port: z.number().int().min(1024).max(65535).default(38120),
    })
    .default({}),
});
export type Config = z.infer<typeof ConfigSchema>;

export function defaultConfig(): Config {
  return ConfigSchema.parse({ version: CONFIG_VERSION });
}

/**
 * Parse arbitrary JSON into a Config. Older/unversioned files are migrated;
 * invalid sections fall back to defaults rather than failing the app.
 */
export function migrateConfig(raw: unknown): Config {
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    const v = typeof r.version === "number" ? r.version : 0;
    if (v === CONFIG_VERSION) {
      const parsed = ConfigSchema.safeParse(raw);
      return parsed.success ? parsed.data : salvage(r);
    }
    if (v < CONFIG_VERSION) return salvage(r);
  }
  return defaultConfig();
}

function salvage(r: Record<string, unknown>): Config {
  const out: Record<string, unknown> = { version: CONFIG_VERSION };
  for (const key of ["audio", "ptt", "clips", "agent", "streamDeck"] as const) {
    const section = ConfigSchema.shape[key];
    const res = section.safeParse(r[key]);
    if (res.success) out[key] = res.data;
  }
  return ConfigSchema.parse(out);
}
