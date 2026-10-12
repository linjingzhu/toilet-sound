import { DEFAULT_MIX, getSound } from "./catalog";
import type { AudioTrack, MixerRequest } from "./contracts";

export const MIX_STORAGE_KEY = "veil.mix.v1";
const STORAGE_VERSION = 1;

export function clampVolume(value: unknown, fallback = 0.5): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function defaultVolume(id: string): number {
  return DEFAULT_MIX.tracks.find((track) => track.id === id)?.volume ?? (getSound(id)?.category === "piano" ? 0.35 : 0.45);
}

/**
 * Validate app selections against the catalog, rebuild canonical local filenames,
 * clamp gains, deduplicate IDs, and keep at most the first valid piano.
 * This preserves explicit empty selections and zero volumes.
 */
export function sanitizeMix(value: unknown): MixerRequest {
  const input = isRecord(value) ? value : DEFAULT_MIX;
  const candidates = Array.isArray(input.tracks) ? input.tracks : DEFAULT_MIX.tracks;
  const tracks: AudioTrack[] = [];
  const seen = new Set<string>();
  let hasPiano = false;

  for (const candidate of candidates) {
    if (!isRecord(candidate) || typeof candidate.id !== "string") continue;
    const sound = getSound(candidate.id);
    if (!sound || seen.has(sound.id) || (sound.category === "piano" && hasPiano)) continue;
    seen.add(sound.id);
    hasPiano ||= sound.category === "piano";
    tracks.push({ id: sound.id, file: sound.file, volume: clampVolume(candidate.volume, defaultVolume(sound.id)) });
  }

  return {
    playing: input.playing === true,
    masterVolume: clampVolume(input.masterVolume, DEFAULT_MIX.masterVolume),
    tracks,
  };
}

/** Persistence contains preferences only. A saved transport state cannot autoplay. */
export function serializeMix(mix: MixerRequest): string {
  const clean = sanitizeMix(mix);
  return JSON.stringify({
    version: STORAGE_VERSION,
    mix: { masterVolume: clean.masterVolume, tracks: clean.tracks.map(({ id, volume }) => ({ id, volume })) },
  });
}

export function restoreMix(saved: string | null | undefined): MixerRequest {
  if (saved) {
    try {
      const value: unknown = JSON.parse(saved);
      if (isRecord(value) && value.version === STORAGE_VERSION && isRecord(value.mix)) {
        return { ...sanitizeMix(value.mix), playing: false };
      }
    } catch {
      // Corrupted or unavailable settings should leave a usable, stopped mixer.
    }
  }
  return { ...sanitizeMix(DEFAULT_MIX), playing: false };
}

export function setMasterVolume(mix: MixerRequest, volume: number): MixerRequest {
  const clean = sanitizeMix(mix);
  return { ...clean, masterVolume: clampVolume(volume, clean.masterVolume) };
}

export function setTrackVolume(mix: MixerRequest, id: string, volume: number): MixerRequest {
  const clean = sanitizeMix(mix);
  return { ...clean, tracks: clean.tracks.map((track) => track.id === id ? { ...track, volume: clampVolume(volume, track.volume) } : track) };
}

export function removeSound(mix: MixerRequest, id: string): MixerRequest {
  const clean = sanitizeMix(mix);
  return { ...clean, tracks: clean.tracks.filter((track) => track.id !== id) };
}

export function selectPiano(mix: MixerRequest, id: string | null, volume?: number): MixerRequest {
  const clean = sanitizeMix(mix);
  const sound = id === null ? undefined : getSound(id);
  if (id !== null && sound?.category !== "piano") return clean;
  const previous = clean.tracks.find((track) => getSound(track.id)?.category === "piano");
  const tracks = clean.tracks.filter((track) => getSound(track.id)?.category !== "piano");
  if (sound) tracks.push({ id: sound.id, file: sound.file, volume: clampVolume(volume, previous?.volume ?? 0.35) });
  return { ...clean, tracks };
}

export function addSound(mix: MixerRequest, id: string, volume?: number): MixerRequest {
  const clean = sanitizeMix(mix);
  const sound = getSound(id);
  if (!sound || clean.tracks.some((track) => track.id === id)) return clean;
  if (sound.category === "piano") return selectPiano(clean, id, volume);
  return { ...clean, tracks: [...clean.tracks, { id, file: sound.file, volume: clampVolume(volume, 0.45) }] };
}

export function toggleSound(mix: MixerRequest, id: string, volume?: number): MixerRequest {
  return mix.tracks.some((track) => track.id === id) ? removeSound(mix, id) : addSound(mix, id, volume);
}
