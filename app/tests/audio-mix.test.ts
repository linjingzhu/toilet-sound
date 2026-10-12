import { describe, expect, it } from "vitest";
import {
  addSound, DEFAULT_MIX, removeSound, restoreMix, sanitizeMix, selectPiano,
  serializeMix, setMasterVolume, setTrackVolume, SOUND_CATALOG, toggleSound,
} from "../src/audio";

describe("mix preferences and selection policy", () => {
  it("starts with the agreed three-track mix and unit-range gains, stopped", () => {
    expect(DEFAULT_MIX).toEqual({
      playing: false, masterVolume: 0.7,
      tracks: [
        { id: "water", file: "water.wav", volume: 0.65 },
        { id: "birds", file: "birds.wav", volume: 0.2 },
        { id: "piano-calm", file: "piano-calm.wav", volume: 0.35 },
      ],
    });
    expect(SOUND_CATALOG.filter((sound) => sound.category !== "piano")).toHaveLength(10);
    expect(SOUND_CATALOG.filter((sound) => sound.category === "piano")).toHaveLength(3);
    expect(new Set(SOUND_CATALOG.map((sound) => sound.file)).size).toBe(13);
  });

  it("rejects unknown IDs and filenames, duplicates, invalid numbers, and a second piano", () => {
    expect(sanitizeMix({
      playing: "yes", masterVolume: Infinity,
      tracks: [
        { id: "water", file: "https://untrusted.example/recording.wav", volume: -2 },
        { id: "water", volume: 0.9 },
        { id: "birds", volume: 4 },
        { id: "piano-night", volume: NaN },
        { id: "piano-warm", volume: 0.9 },
        { id: "missing", volume: 0.4 }, null, "rain",
      ],
    })).toEqual({
      playing: false, masterVolume: 0.7,
      tracks: [
        { id: "water", file: "water.wav", volume: 0 },
        { id: "birds", file: "birds.wav", volume: 1 },
        { id: "piano-night", file: "piano-night.wav", volume: 0.35 },
      ],
    });
  });

  it("retains explicit silence and empty selections during round trips", () => {
    const silent = { playing: true, masterVolume: 0, tracks: [] };
    expect(restoreMix(serializeMix(silent))).toEqual({ ...silent, playing: false });
    const zeroTrack = setTrackVolume(DEFAULT_MIX, "water", 0);
    expect(restoreMix(serializeMix(zeroTrack)).tracks[0].volume).toBe(0);
  });

  it.each([null, undefined, "", "{bad-json", "null", "[]", '{"version":99,"mix":{}}'])
    ("falls back to a fresh stopped default for invalid storage %s", (value) => {
      const restored = restoreMix(value);
      expect(restored).toEqual(DEFAULT_MIX);
      expect(restored).not.toBe(DEFAULT_MIX);
      expect(restored.tracks[0]).not.toBe(DEFAULT_MIX.tracks[0]);
    });

  it("never restores autoplay even if a crafted persisted object contains playing:true", () => {
    const restored = restoreMix(JSON.stringify({ version: 1, mix: { ...DEFAULT_MIX, playing: true } }));
    expect(restored.playing).toBe(false);
    const saved = JSON.parse(serializeMix({ ...DEFAULT_MIX, playing: true }));
    expect(saved.mix).not.toHaveProperty("playing");
    expect(saved.mix.tracks[0]).not.toHaveProperty("file");
  });

  it("updates gains and selections without mutating the input or losing environments", () => {
    const original = structuredClone(DEFAULT_MIX);
    const changed = setMasterVolume(setTrackVolume(DEFAULT_MIX, "water", 0.13), 0.46);
    const replaced = selectPiano(changed, "piano-warm");
    expect(DEFAULT_MIX).toEqual(original);
    expect(replaced.masterVolume).toBe(0.46);
    expect(replaced.tracks).toEqual([
      { id: "water", file: "water.wav", volume: 0.13 },
      { id: "birds", file: "birds.wav", volume: 0.2 },
      { id: "piano-warm", file: "piano-warm.wav", volume: 0.35 },
    ]);
    expect(selectPiano(replaced, null).tracks).toEqual(replaced.tracks.slice(0, 2));
    expect(selectPiano(replaced, "water")).toEqual(replaced);
  });

  it("deduplicates adds, toggles tracks, and allows a stopped piano-free mix", () => {
    expect(addSound(DEFAULT_MIX, "water").tracks).toHaveLength(3);
    const extra = addSound(DEFAULT_MIX, "rain", 0.28);
    expect(extra.tracks.at(-1)).toEqual({ id: "rain", file: "rain.wav", volume: 0.28 });
    expect(toggleSound(extra, "rain")).toEqual(DEFAULT_MIX);
    expect(removeSound(extra, "rain")).toEqual(DEFAULT_MIX);
    expect(selectPiano({ playing: false, masterVolume: 0.7, tracks: [] }, "piano-night").tracks[0].volume).toBe(0.35);
    expect(addSound(selectPiano(DEFAULT_MIX, null), "piano-night").tracks.at(-1)?.volume).toBe(0.35);
  });
});
