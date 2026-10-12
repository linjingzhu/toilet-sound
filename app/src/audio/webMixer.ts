import type { AudioStatus, AudioTrack, MixerEngine, MixerRequest } from "./contracts";
import { clampVolume } from "./mix";

const OUTPUT_NAME = "브라우저 기본 출력";
const DEFAULT_RAMP_SECONDS = 0.04;

export interface WebMixerOptions {
  assetBase?: string;
  contextFactory?: () => AudioContext;
  fetcher?: typeof fetch;
  rampSeconds?: number;
}

interface GainEnvelope {
  from: number;
  to: number;
  start: number;
  end: number;
}

interface PlayingTrack {
  id: string;
  file: string;
  source: AudioBufferSourceNode;
  gain: GainNode;
  envelope: GainEnvelope;
  retired: boolean;
  cleaned: boolean;
  cleanupTimer?: ReturnType<typeof setTimeout>;
}

interface BufferLoad {
  controller: AbortController;
  promise: Promise<AudioBuffer>;
}

interface PendingStart {
  file: string;
  controller: AbortController;
  promise: Promise<void>;
}

function abortError(): Error {
  const error = new Error("Audio work was superseded");
  error.name = "AbortError";
  return error;
}

/** Decoding cannot be cancelled by Web Audio, so cancellation also guards its result. */
function abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError());
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function defaultContextFactory(): AudioContext {
  const scope = globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext };
  const Constructor = scope.AudioContext ?? scope.webkitAudioContext;
  if (!Constructor) throw new Error("Web Audio is unavailable");
  return new Constructor({ latencyHint: "playback" });
}

/**
 * The engine accepts local asset filenames independently from the app catalog,
 * so changing a file under the same track ID replaces only that source.
 * Catalog and one-piano policy are enforced by the public pure mix helpers.
 */
function normalizeRequest(mix: MixerRequest): MixerRequest {
  const tracks = new Map<string, AudioTrack>();
  for (const track of Array.isArray(mix?.tracks) ? mix.tracks : []) {
    if (!track || typeof track.id !== "string" || typeof track.file !== "string") continue;
    if (!/^[a-z\d][a-z\d_-]{0,63}$/i.test(track.id)) continue;
    if (!/^[a-z\d][a-z\d_.-]*\.(?:wav|mp3|ogg|m4a)$/i.test(track.file)) continue;
    tracks.set(track.id, { id: track.id, file: track.file, volume: clampVolume(track.volume) });
  }
  return { playing: mix?.playing === true, masterVolume: clampVolume(mix?.masterVolume, 0.7), tracks: [...tracks.values()] };
}

/**
 * Owns one Web Audio graph: loop sources → independent gains → VEIL master gain
 * → this context's destination. It never touches shared/system media volume,
 * other media elements, audio focus, or another application's audio session.
 */
export class WebMixer implements MixerEngine {
  private readonly assetBase: string;
  private readonly contextFactory: () => AudioContext;
  private readonly fetcher: typeof fetch;
  private readonly rampSeconds: number;
  private context?: AudioContext;
  private master?: GainNode;
  private masterEnvelope: GainEnvelope = { from: 0, to: 0, start: 0, end: 0 };
  private desired: MixerRequest = { playing: false, masterVolume: 0.7, tracks: [] };
  private readonly active = new Map<string, PlayingTrack>();
  private readonly retired = new Set<PlayingTrack>();
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly loads = new Map<string, BufferLoad>();
  private readonly starts = new Map<string, PendingStart>();
  private readonly listeners = new Set<(state: AudioStatus) => void>();
  private requestController?: AbortController;
  private resumePromise?: Promise<void>;
  private contextHasRun = false;
  private error?: string;
  private state: AudioStatus = { playing: false, outputName: OUTPUT_NAME, interrupted: false };
  private disposed = false;
  private disposal?: Promise<void>;

  constructor(options: WebMixerOptions = {}) {
    this.assetBase = `${(options.assetBase ?? "/app/audio/").replace(/\/$/, "")}/`;
    this.contextFactory = options.contextFactory ?? defaultContextFactory;
    this.fetcher = options.fetcher ?? ((...args) => globalThis.fetch(...args));
    this.rampSeconds = typeof options.rampSeconds === "number" && Number.isFinite(options.rampSeconds)
      ? Math.min(0.25, Math.max(0.005, options.rampSeconds))
      : DEFAULT_RAMP_SECONDS;
  }

  async setMix(mix: MixerRequest): Promise<AudioStatus> {
    if (this.disposed) return { ...this.state, error: "오디오 믹서가 종료되었습니다." };
    this.requestController?.abort();
    const request = new AbortController();
    this.requestController = request;
    this.desired = normalizeRequest(mix);
    this.error = undefined;
    this.reconcileExisting();

    // Restoring preferences and selecting sounds while stopped does no audio work.
    if (!this.desired.playing || this.desired.tracks.length === 0) {
      this.desired = { ...this.desired, playing: false };
      this.publish();
      return this.snapshot();
    }

    try {
      const context = this.ensureContext();
      this.masterEnvelope = this.ramp(this.master!.gain, this.masterEnvelope, this.desired.masterVolume);
      // Call resume in the setMix/user-gesture turn, before awaiting fetch/decode.
      const running = this.ensureRunning(context);
      const work: Promise<unknown>[] = [running];
      for (const track of this.desired.tracks) {
        if (!this.active.has(track.id)) work.push(this.ensureStart(track, running));
      }
      this.publish();
      await abortable(Promise.allSettled(work), request.signal);
    } catch (error) {
      if (!isAbort(error) && !this.disposed && this.requestController === request) {
        this.error = "이 브라우저에서는 오디오를 시작할 수 없습니다. 다시 재생해 주세요.";
      }
    }
    if (!this.disposed && this.requestController === request && this.desired.playing && this.active.size === 0) {
      // A fully failed start has returned control to the user as stopped. Clear
      // its intent so a later browser state event cannot retry it and autoplay.
      // Keep successful sources and their selection intact on partial failure.
      this.desired = { ...this.desired, playing: false };
      this.reconcileExisting();
    }
    this.publish();
    return this.snapshot();
  }

  async getState(): Promise<AudioStatus> {
    this.publish();
    return this.snapshot();
  }

  onStateChange(listener: (state: AudioStatus) => void): () => void {
    if (this.disposed) return () => undefined;
    this.listeners.add(listener);
    this.notify(listener);
    return () => { this.listeners.delete(listener); };
  }

  dispose(): Promise<void> {
    if (this.disposed) return this.disposal ?? Promise.resolve();
    this.disposed = true;
    this.desired = { ...this.desired, playing: false };
    this.requestController?.abort();
    for (const start of this.starts.values()) start.controller.abort();
    this.starts.clear();
    for (const load of this.loads.values()) load.controller.abort();
    this.loads.clear();
    for (const track of [...this.active.values(), ...this.retired]) this.retire(track, true);
    this.buffers.clear();
    this.master?.disconnect();
    this.context?.removeEventListener("statechange", this.handleContextState);
    this.publish();
    this.listeners.clear();
    this.disposal = (async () => {
      if (this.context && this.context.state !== "closed") {
        try { await this.context.close(); } catch { /* Already closing or unavailable. Nodes are disconnected. */ }
      }
    })();
    return this.disposal;
  }

  private snapshot(): AudioStatus {
    return { ...this.state };
  }

  private notify(listener: (state: AudioStatus) => void): void {
    try { listener(this.snapshot()); } catch { /* A view observer must not break audio cleanup. */ }
  }

  private publish(): void {
    const hasSources = !this.disposed && this.desired.playing && this.active.size > 0;
    const state: AudioStatus = {
      playing: hasSources && this.context?.state === "running",
      outputName: OUTPUT_NAME,
      interrupted: !this.disposed && this.desired.playing && this.desired.tracks.length > 0
        && this.contextHasRun && !this.resumePromise && this.context?.state !== "running",
      ...(this.error ? { error: this.error } : {}),
    };
    if (state.playing === this.state.playing && state.interrupted === this.state.interrupted && state.error === this.state.error) return;
    this.state = state;
    for (const listener of [...this.listeners]) this.notify(listener);
  }

  private readonly handleContextState = (): void => {
    if (this.context?.state === "running") this.contextHasRun = true;
    this.publish();
    // A decode can finish while a context is interrupted. If the consumer keeps
    // its play request, complete only those still-selected sources when the
    // browser itself resumes. Never call context.resume() from this observer.
    if (!this.disposed && this.context?.state === "running" && this.desired.playing) {
      for (const track of this.desired.tracks) {
        if (!this.active.has(track.id)) void this.ensureStart(track, Promise.resolve());
      }
    }
  };

  private ensureContext(): AudioContext {
    if (!this.context) {
      const context = this.contextFactory();
      this.context = context;
      this.master = context.createGain();
      this.master.gain.setValueAtTime(0, context.currentTime);
      this.masterEnvelope = { from: 0, to: 0, start: context.currentTime, end: context.currentTime };
      this.master.connect(context.destination);
      context.addEventListener("statechange", this.handleContextState);
    }
    if (this.context.state === "closed") throw new Error("Audio context is closed");
    return this.context;
  }

  private ensureRunning(context: AudioContext): Promise<void> {
    if (context.state === "running") {
      this.contextHasRun = true;
      return Promise.resolve();
    }
    if (this.resumePromise) return this.resumePromise;
    const work = context.resume().catch((error: unknown) => {
      if (!this.disposed && this.desired.playing) {
        this.error = "재생이 허용되지 않았습니다. 재생 버튼을 다시 눌러 주세요.";
        this.publish();
      }
      throw error;
    }).finally(() => {
      if (this.resumePromise === work) this.resumePromise = undefined;
    });
    this.resumePromise = work;
    return work;
  }

  private reconcileExisting(): void {
    const selected = new Map(this.desired.tracks.map((track) => [track.id, track]));
    for (const track of this.active.values()) {
      const desired = selected.get(track.id);
      if (!this.desired.playing || desired?.file !== track.file) this.retire(track);
      else track.envelope = this.ramp(track.gain.gain, track.envelope, desired.volume);
    }
    for (const [id, start] of this.starts) {
      if (!this.desired.playing || selected.get(id)?.file !== start.file) {
        this.starts.delete(id);
        start.controller.abort();
      }
    }
    const wantedFiles = new Set(this.desired.playing ? this.desired.tracks.map((track) => track.file) : []);
    for (const [file, load] of this.loads) {
      if (!wantedFiles.has(file)) {
        // Remove synchronously so a quick re-selection can start a fresh request.
        this.loads.delete(file);
        load.controller.abort();
      }
    }
    if (this.master) this.masterEnvelope = this.ramp(this.master.gain, this.masterEnvelope, this.desired.masterVolume);
  }

  private wanted(id: string, file: string): AudioTrack | undefined {
    return !this.disposed && this.desired.playing
      ? this.desired.tracks.find((track) => track.id === id && track.file === file)
      : undefined;
  }

  private ensureStart(track: AudioTrack, running: Promise<void>): Promise<void> {
    const existing = this.starts.get(track.id);
    if (existing?.file === track.file) return existing.promise;
    const entry: PendingStart = { file: track.file, controller: new AbortController(), promise: Promise.resolve() };
    this.starts.set(track.id, entry);
    entry.promise = (async () => {
      try {
        const [buffer] = await abortable(Promise.all([this.loadBuffer(track.file), running]), entry.controller.signal);
        const desired = this.wanted(track.id, track.file);
        const context = this.context;
        if (!desired || !context || context.state !== "running" || this.active.has(track.id)) return;
        const source = context.createBufferSource();
        const gain = context.createGain();
        const playing: PlayingTrack = {
          id: track.id, file: track.file, source, gain, retired: false, cleaned: false,
          envelope: { from: 0, to: 0, start: context.currentTime, end: context.currentTime },
        };
        try {
          source.buffer = buffer;
          source.loop = true;
          gain.gain.setValueAtTime(0, context.currentTime);
          source.connect(gain);
          gain.connect(this.master!);
          source.onended = () => {
            if (!playing.retired && !this.disposed) this.error = "오디오 재생이 중단되었습니다. 다시 재생해 주세요.";
            this.cleanupTrack(playing);
            this.publish();
          };
          // Add before start so synchronous teardown can always find the nodes.
          this.active.set(track.id, playing);
          source.start();
          playing.envelope = this.ramp(gain.gain, playing.envelope, desired.volume);
        } catch (error) {
          this.retire(playing, true);
          throw error;
        }
      } catch (error) {
        if (!isAbort(error) && this.wanted(track.id, track.file)) {
          this.error = `소리를 불러오지 못했습니다 (${track.id}). 다시 재생해 주세요.`;
        }
      } finally {
        if (this.starts.get(track.id) === entry) this.starts.delete(track.id);
        this.publish();
      }
    })();
    return entry.promise;
  }

  private loadBuffer(file: string): Promise<AudioBuffer> {
    const cached = this.buffers.get(file);
    if (cached) return Promise.resolve(cached);
    const loading = this.loads.get(file);
    if (loading) return loading.promise;
    const entry: BufferLoad = { controller: new AbortController(), promise: Promise.resolve(undefined as never) };
    this.loads.set(file, entry);
    const decode = async (): Promise<AudioBuffer> => {
      const response = await this.fetcher(`${this.assetBase}${encodeURIComponent(file)}`, { signal: entry.controller.signal });
      if (!response.ok) throw new Error(`Audio HTTP ${response.status}`);
      const bytes = await response.arrayBuffer();
      if (entry.controller.signal.aborted || this.disposed) throw abortError();
      return this.context!.decodeAudioData(bytes);
    };
    entry.promise = abortable(decode(), entry.controller.signal).then((buffer) => {
      if (entry.controller.signal.aborted || this.disposed) throw abortError();
      this.buffers.set(file, buffer);
      return buffer;
    }).finally(() => {
      if (this.loads.get(file) === entry) this.loads.delete(file);
    });
    return entry.promise;
  }

  private ramp(param: AudioParam, envelope: GainEnvelope, target: number): GainEnvelope {
    if (envelope.to === target) return envelope;
    const now = this.context?.currentTime ?? 0;
    const progress = envelope.end <= envelope.start ? 1 : Math.max(0, Math.min(1, (now - envelope.start) / (envelope.end - envelope.start)));
    const current = envelope.from + (envelope.to - envelope.from) * progress;
    // The stored envelope keeps fast slider movements continuous even in engines
    // without cancelAndHoldAtTime, whose AudioParam.value may be the future target.
    param.cancelScheduledValues(now);
    param.setValueAtTime(current, now);
    param.linearRampToValueAtTime(target, now + this.rampSeconds);
    return { from: current, to: target, start: now, end: now + this.rampSeconds };
  }

  private retire(track: PlayingTrack, immediate = false): void {
    if (track.cleaned) return;
    if (this.active.get(track.id) === track) this.active.delete(track.id);
    track.retired = true;
    this.retired.add(track);
    const now = this.context?.currentTime ?? 0;
    if (immediate) {
      try { track.source.stop(now); } catch { /* It may not have started. */ }
      this.cleanupTrack(track);
      return;
    }
    track.envelope = this.ramp(track.gain.gain, track.envelope, 0);
    try { track.source.stop(now + this.rampSeconds); } catch { this.cleanupTrack(track); return; }
    // A suspended context may never deliver `ended`; wall-clock cleanup also
    // releases disconnected retired nodes without touching current replacements.
    track.cleanupTimer = setTimeout(() => this.cleanupTrack(track), this.rampSeconds * 1000 + 30);
  }

  private cleanupTrack(track: PlayingTrack): void {
    if (track.cleaned) return;
    track.cleaned = true;
    if (track.cleanupTimer !== undefined) clearTimeout(track.cleanupTimer);
    track.source.onended = null;
    track.source.disconnect();
    track.gain.disconnect();
    if (this.active.get(track.id) === track) this.active.delete(track.id);
    this.retired.delete(track);
  }
}

export function createWebMixer(options?: WebMixerOptions): MixerEngine {
  return new WebMixer(options);
}
