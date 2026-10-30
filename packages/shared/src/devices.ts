export interface OutputDevice {
  deviceId: string;
  label: string;
}

/**
 * Preference for the default output: a Wave Link "Soundboard" endpoint, then other Wave Link
 * app/aux inputs, then any Wave Link device. Never auto-picks a physical device.
 * Returns null when nothing matches (caller leaves the system default).
 */
export function pickDefaultOutput(devices: OutputDevice[]): OutputDevice | null {
  const tiers = [/wave\s*link.*soundboard|soundboard.*wave\s*link|elgato.*soundboard/i, /wave\s*link.*(aux|sfx|effects?|system|music|game)/i, /wave\s*link/i];
  for (const re of tiers) {
    const hit = devices.find((d) => d.deviceId !== "default" && d.deviceId !== "communications" && re.test(d.label));
    if (hit) return hit;
  }
  return null;
}
