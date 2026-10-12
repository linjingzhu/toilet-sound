import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWebMixer, DEFAULT_MIX, selectPiano, setMasterVolume, setTrackVolume } from "../src/audio";
import type { AudioStatus, MixerEngine, MixerRequest } from "../src/audio";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

class FakeParam {
  value = 1;
  events: { type: string; value?: number; time: number }[] = [];
  setValueAtTime(value: number, time: number) { this.value = value; this.events.push({ type: "set", value, time }); return this; }
  linearRampToValueAtTime(value: number, time: number) { this.value = value; this.events.push({ type: "ramp", value, time }); return this; }
  cancelScheduledValues(time: number) { this.events.push({ type: "cancel", time }); return this; }
  get target() { return this.events.filter((event) => event.type === "ramp").at(-1)?.value ?? this.value; }
}

class FakeGain {
  gain = new FakeParam();
  connections: unknown[] = [];
  connect = vi.fn((destination: unknown) => { this.connections.push(destination); });
  disconnect = vi.fn(() => { this.connections = []; });
}

class FakeSource {
  buffer: AudioBuffer | null = null;
  loop = false;
  onended: (() => void) | null = null;
  connections: unknown[] = [];
  connect = vi.fn((destination: unknown) => { this.connections.push(destination); });
  disconnect = vi.fn(() => { this.connections = []; });
  start = vi.fn();
  stop = vi.fn();
  get trackGain() { return this.connections[0] as FakeGain; }
}

function bufferFor(file: string): AudioBuffer {
  return { duration: 16, length: 352_800, sampleRate: 22_050, numberOfChannels: 1, file } as unknown as AudioBuffer;
}

function responseFor(file: string, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, arrayBuffer: async () => new TextEncoder().encode(file).buffer } as Response;
}

class FakeContext extends EventTarget {
  state: AudioContextState = "suspended";
  currentTime = 0;
  destination = {};
  gains: FakeGain[] = [];
  sources: FakeSource[] = [];
  createGain = vi.fn(() => { const gain = new FakeGain(); this.gains.push(gain); return gain; });
  createBufferSource = vi.fn(() => { const source = new FakeSource(); this.sources.push(source); return source; });
  decodeAudioData = vi.fn(async (bytes: ArrayBuffer) => bufferFor(new TextDecoder().decode(bytes)));
  resume = vi.fn(async () => { this.setState("running"); });
  close = vi.fn(async () => { this.setState("closed"); });
  setState(state: AudioContextState) { this.state = state; this.dispatchEvent(new Event("statechange")); }
}

const mixers: MixerEngine[] = [];
function harness() {
  const context = new FakeContext();
  const fetcher = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => responseFor(String(input).split("/").at(-1)!));
  const contextFactory = vi.fn(() => context as unknown as AudioContext);
  const engine = createWebMixer({ contextFactory, fetcher: fetcher as typeof fetch });
  mixers.push(engine);
  return { context, fetcher, contextFactory, engine };
}

function playing(mix: MixerRequest = DEFAULT_MIX): MixerRequest { return { ...mix, playing: true }; }
const waterOnly: MixerRequest = { playing: true, masterVolume: 0.7, tracks: [{ id: "water", file: "water.wav", volume: 0.65 }] };
async function flush() { for (let index = 0; index < 24; index++) await Promise.resolve(); }

beforeEach(() => vi.useFakeTimers());
afterEach(async () => {
  await Promise.all(mixers.splice(0).map((engine) => engine.dispose()));
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("WebMixer graph and continuity", () => {
  it("does not create an audio context or fetch assets before an explicit play request", async () => {
    const { engine, contextFactory, fetcher } = harness();
    await engine.setMix(DEFAULT_MIX);
    await engine.setMix(setTrackVolume(DEFAULT_MIX, "water", 0.2));
    expect((await engine.getState()).playing).toBe(false);
    expect(contextFactory).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("routes independent track gains through only the VEIL master gain and preserves source identity", async () => {
    const { engine, context, fetcher } = harness();
    expect((await engine.setMix(playing())).playing).toBe(true);
    const [water, birds, piano] = context.sources;
    const master = context.gains[0];
    expect(master.connections).toEqual([context.destination]);
    expect(master.gain.target).toBe(0.7);
    expect(context.sources.map((source) => source.trackGain.gain.target)).toEqual([0.65, 0.2, 0.35]);
    for (const source of context.sources) {
      expect(source.loop).toBe(true);
      expect(source.trackGain.connections).toEqual([master]);
      expect(source.start).toHaveBeenCalledTimes(1);
    }
    expect(fetcher.mock.calls[0][0]).toBe("/app/audio/water.wav");
    context.currentTime = 1;
    const changed = setMasterVolume(setTrackVolume(playing(), "water", 0.21), 0.3);
    await engine.setMix(changed);
    expect(context.sources).toEqual([water, birds, piano]);
    expect(water.trackGain.gain.target).toBe(0.21);
    expect(master.gain.target).toBe(0.3);
    expect(fetcher).toHaveBeenCalledTimes(3);
    await engine.setMix(selectPiano(changed, "piano-warm"));
    expect(context.sources).toHaveLength(4);
    expect(piano.stop).toHaveBeenCalledTimes(1);
    expect(water.stop).not.toHaveBeenCalled();
    expect(birds.stop).not.toHaveBeenCalled();
    expect(water.start).toHaveBeenCalledTimes(1);
    expect(birds.start).toHaveBeenCalledTimes(1);
  });

  it("continues an in-flight linear ramp from its current value during fast slider movements", async () => {
    const { engine, context } = harness();
    await engine.setMix(waterOnly);
    const gain = context.sources[0].trackGain.gain;
    context.currentTime = 0.02; // Halfway through the 0 → .65 / 40 ms start ramp.
    await engine.setMix({ ...waterOnly, tracks: [{ ...waterOnly.tracks[0], volume: 0.1 }] });
    expect(gain.events.filter((event) => event.type === "set").at(-1)?.value).toBeCloseTo(0.325);
    expect(gain.events.at(-1)).toEqual({ type: "ramp", value: 0.1, time: 0.06 });
    expect(context.sources).toHaveLength(1);
  });

  it("replaces a changed file under one ID without rebuilding unrelated sources", async () => {
    const { engine, context } = harness();
    const mix = { ...waterOnly, tracks: [...waterOnly.tracks, { id: "birds", file: "birds.wav", volume: 0.2 }] };
    await engine.setMix(mix);
    const [water, birds] = context.sources;
    await engine.setMix({ ...mix, tracks: [{ ...mix.tracks[0], file: "water-alt.wav" }, mix.tracks[1]] });
    expect(water.stop).toHaveBeenCalledTimes(1);
    expect(birds.stop).not.toHaveBeenCalled();
    expect(context.sources).toHaveLength(3);
    expect(context.sources[2].buffer).toMatchObject({ file: "water-alt.wav" });
  });

  it("cleans retired nodes after the fade and closes all owned resources exactly once", async () => {
    const { engine, context } = harness();
    await engine.setMix(playing());
    const sources = [...context.sources];
    const gains = [...context.gains];
    context.currentTime = 1;
    await engine.setMix({ ...playing(), tracks: [DEFAULT_MIX.tracks[0]] });
    expect(sources[1].stop).toHaveBeenCalledWith(1.04);
    expect(sources[1].disconnect).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(80);
    expect(sources[1].disconnect).toHaveBeenCalledTimes(1);
    expect(sources[2].disconnect).toHaveBeenCalledTimes(1);
    expect(sources[0].disconnect).not.toHaveBeenCalled();
    await engine.dispose();
    await engine.dispose();
    for (const source of sources) expect(source.disconnect).toHaveBeenCalledTimes(1);
    for (const gain of gains) expect(gain.disconnect).toHaveBeenCalledTimes(1);
    expect(context.close).toHaveBeenCalledTimes(1);
    expect((await engine.getState()).playing).toBe(false);
  });
});

describe("WebMixer asynchronous resource races", () => {
  it("shares a pending decode and applies the newest volumes without duplicate starts", async () => {
    const { engine, context, fetcher } = harness();
    const decoding = deferred<AudioBuffer>();
    context.decodeAudioData.mockReturnValue(decoding.promise);
    const first = engine.setMix(waterOnly);
    await flush();
    const latest = engine.setMix({ ...waterOnly, masterVolume: 0.2, tracks: [{ ...waterOnly.tracks[0], volume: 0.1 }] });
    decoding.resolve(bufferFor("water.wav"));
    await Promise.all([first, latest]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(context.decodeAudioData).toHaveBeenCalledTimes(1);
    expect(context.sources).toHaveLength(1);
    expect(context.sources[0].trackGain.gain.target).toBe(0.1);
    expect(context.gains[0].gain.target).toBe(0.2);
  });

  it("discards late decoded audio after stop and allows a fresh later start", async () => {
    const { engine, context, fetcher } = harness();
    const decoding = deferred<AudioBuffer>();
    context.decodeAudioData.mockReturnValueOnce(decoding.promise);
    const starting = engine.setMix(waterOnly);
    await flush();
    expect(context.decodeAudioData).toHaveBeenCalledTimes(1);
    expect((await engine.setMix({ ...waterOnly, playing: false })).playing).toBe(false);
    await starting; // Stop settles the waiting caller even though decode is still pending.
    decoding.resolve(bufferFor("stale-water.wav"));
    await flush();
    expect(context.sources).toHaveLength(0);
    await engine.setMix(waterOnly);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(context.sources).toHaveLength(1);
    expect(context.sources[0].buffer).toMatchObject({ file: "water.wav" });
  });

  it("only starts the newest of rapidly replaced piano requests, preserving the running water", async () => {
    const { engine, context, fetcher } = harness();
    await engine.setMix(waterOnly);
    const water = context.sources[0];
    const requests = new Map<string, ReturnType<typeof deferred<Response>>>();
    const signals = new Map<string, AbortSignal>();
    fetcher.mockImplementation((input, init) => {
      const file = String(input).split("/").at(-1)!;
      const response = deferred<Response>();
      requests.set(file, response);
      signals.set(file, init!.signal as AbortSignal);
      return response.promise; // Deliberately ignores abort to exercise stale-result guards.
    });
    const first = engine.setMix(selectPiano(waterOnly, "piano-calm"));
    const second = engine.setMix(selectPiano(waterOnly, "piano-warm"));
    const last = engine.setMix(selectPiano(waterOnly, "piano-night"));
    expect(signals.get("piano-calm.wav")!.aborted).toBe(true);
    expect(signals.get("piano-warm.wav")!.aborted).toBe(true);
    requests.get("piano-night.wav")!.resolve(responseFor("piano-night.wav"));
    await last;
    requests.get("piano-warm.wav")!.reject(new Error("stale failure"));
    requests.get("piano-calm.wav")!.resolve(responseFor("piano-calm.wav"));
    await Promise.all([first, second]);
    await flush();
    expect(context.sources).toHaveLength(2);
    expect(context.sources[1].buffer).toMatchObject({ file: "piano-night.wav" });
    expect(water.start).toHaveBeenCalledTimes(1);
    expect(water.stop).not.toHaveBeenCalled();
    expect(await engine.getState()).toMatchObject({ playing: true });
    expect((await engine.getState()).error).toBeUndefined();
  });

  it("cancels a fetch and prevents all late work or new playback after disposal", async () => {
    const { engine, context, fetcher, contextFactory } = harness();
    const fetching = deferred<Response>();
    fetcher.mockReturnValue(fetching.promise);
    const starting = engine.setMix(waterOnly);
    const signal = fetcher.mock.calls[0][1]!.signal as AbortSignal;
    await engine.dispose();
    expect(signal.aborted).toBe(true);
    await starting;
    fetching.resolve(responseFor("water.wav"));
    await flush();
    expect(context.decodeAudioData).not.toHaveBeenCalled();
    expect(context.sources).toHaveLength(0);
    expect(context.gains[0].disconnect).toHaveBeenCalledTimes(1);
    expect(context.close).toHaveBeenCalledTimes(1);
    expect((await engine.setMix(waterOnly)).playing).toBe(false);
    expect(contextFactory).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not autoplay when a pending context resume resolves after the user stops", async () => {
    const { engine, context } = harness();
    const resuming = deferred<void>();
    context.resume.mockImplementation(() => resuming.promise.then(() => { context.setState("running"); }));
    const starting = engine.setMix(waterOnly);
    await flush();
    await engine.setMix({ ...waterOnly, playing: false });
    await starting;
    resuming.resolve();
    await flush();
    expect(context.sources).toHaveLength(0);
    expect((await engine.getState()).playing).toBe(false);
  });

  it("keeps successful audio playing on a failed fetch and retries only the missing track", async () => {
    const { engine, context, fetcher } = harness();
    let failBirds = true;
    fetcher.mockImplementation(async (input) => {
      const file = String(input).split("/").at(-1)!;
      return responseFor(file, file === "birds.wav" && failBirds ? 404 : 200);
    });
    const mix = { ...waterOnly, tracks: [...waterOnly.tracks, { id: "birds", file: "birds.wav", volume: 0.2 }] };
    const failed = await engine.setMix(mix);
    expect(failed.playing).toBe(true);
    expect(failed.error).toContain("birds");
    expect(context.sources).toHaveLength(1);
    const water = context.sources[0];
    failBirds = false;
    const retried = await engine.setMix(mix);
    expect(retried.error).toBeUndefined();
    expect(context.sources).toHaveLength(2);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(water.stop).not.toHaveBeenCalled();
  });

  it("returns an error for decode failure and browser resume denial instead of claiming playback", async () => {
    const decoding = harness();
    decoding.context.decodeAudioData.mockRejectedValue(new Error("invalid WAV"));
    expect(await decoding.engine.setMix(waterOnly)).toMatchObject({ playing: false, error: expect.any(String) });
    expect(decoding.context.sources).toHaveLength(0);
    const denied = harness();
    denied.context.resume.mockRejectedValue(new Error("NotAllowedError"));
    expect(await denied.engine.setMix(waterOnly)).toMatchObject({ playing: false, error: expect.any(String) });
    expect(denied.context.sources).toHaveLength(0);
  });

  it.each(["fetch", "decode", "resume"] as const)
    ("requires a new explicit Play after a complete %s failure, even if the context later resumes", async (failure) => {
      const { engine, context, fetcher } = harness();
      if (failure === "fetch") fetcher.mockRejectedValueOnce(new Error("temporarily offline"));
      if (failure === "decode") context.decodeAudioData.mockRejectedValueOnce(new Error("invalid first decode"));
      if (failure === "resume") context.resume.mockRejectedValueOnce(new Error("playback denied"));
      expect(await engine.setMix(waterOnly)).toMatchObject({ playing: false, error: expect.any(String) });
      const fetchCount = fetcher.mock.calls.length;
      const decodeCount = context.decodeAudioData.mock.calls.length;

      context.setState("suspended");
      context.setState("running");
      await flush();
      expect(context.sources).toHaveLength(0);
      expect(fetcher).toHaveBeenCalledTimes(fetchCount);
      expect(context.decodeAudioData).toHaveBeenCalledTimes(decodeCount);
      expect((await engine.getState()).playing).toBe(false);

      expect(await engine.setMix(waterOnly)).toMatchObject({ playing: true });
      expect(context.sources).toHaveLength(1);
    });

  it("also clears latent playback when all selected tracks fail together", async () => {
    const { engine, context, fetcher } = harness();
    fetcher.mockRejectedValue(new Error("assets unavailable"));
    expect((await engine.setMix(playing())).playing).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(3);
    fetcher.mockImplementation(async (input) => responseFor(String(input).split("/").at(-1)!));
    context.setState("suspended");
    context.setState("running");
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(context.sources).toHaveLength(0);
    expect((await engine.setMix(playing())).playing).toBe(true);
    expect(context.sources).toHaveLength(3);
  });

  it("reports suspended audio and respects a user stop across subsequent context state events", async () => {
    const { engine, context } = harness();
    const changes: AudioStatus[] = [];
    const unsubscribe = engine.onStateChange((state) => changes.push(state));
    await engine.setMix(waterOnly);
    context.setState("suspended");
    expect(changes.at(-1)).toMatchObject({ playing: false, interrupted: true });
    await engine.setMix({ ...waterOnly, playing: false });
    context.setState("running");
    expect(await engine.getState()).toMatchObject({ playing: false, interrupted: false });
    const count = changes.length;
    unsubscribe();
    await engine.setMix(waterOnly);
    expect(changes).toHaveLength(count);
  });

  it("reports an interruption during decode so a consumer stop also prevents late automatic playback", async () => {
    const { engine, context } = harness();
    const decoding = deferred<AudioBuffer>();
    context.decodeAudioData.mockReturnValue(decoding.promise);
    const interruptions: AudioStatus[] = [];
    engine.onStateChange((state) => {
      if (state.interrupted) {
        interruptions.push(state);
        void engine.setMix({ ...waterOnly, playing: false });
      }
    });
    const starting = engine.setMix(waterOnly);
    await flush();
    expect(context.sources).toHaveLength(0);
    context.setState("suspended");
    await starting;
    expect(interruptions).toHaveLength(1);
    decoding.resolve(bufferFor("water.wav"));
    context.setState("running");
    await flush();
    expect(context.sources).toHaveLength(0);
    expect((await engine.getState()).playing).toBe(false);
  });
});
