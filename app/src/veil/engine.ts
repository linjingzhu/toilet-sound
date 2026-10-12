import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { createWebMixer } from "../audio";
import type { AudioStatus, MixerEngine, MixerRequest } from "../audio/contracts";

interface NativeAudioPlugin {
  setMix(mix: MixerRequest): Promise<AudioStatus>;
  getState(): Promise<AudioStatus>;
  dispose(): Promise<void>;
  addListener(event: "stateChanged", listener: (state: AudioStatus) => void): Promise<PluginListenerHandle>;
}

function disposedStatus(): AudioStatus {
  return { playing: false, outputName: "기본 출력", error: "오디오 믹서가 종료되었습니다." };
}

/** One native plugin controls one process-wide mixer, regardless of React mounts. */
class NativeAudioSession {
  private readonly plugin = registerPlugin<NativeAudioPlugin>("VeilAudio");
  private readonly clients = new Set<symbol>();
  private generation = 0;
  private disposedGeneration = 0;
  private disposalBarrier?: Promise<void>;

  acquire(): symbol {
    const client = Symbol("native-mixer-client");
    this.clients.add(client);
    this.generation += 1;
    return client;
  }

  release(client: symbol): void {
    this.clients.delete(client);
  }

  async listen(client: symbol, listener: (state: AudioStatus) => void): Promise<PluginListenerHandle | undefined> {
    while (this.disposalBarrier) await this.disposalBarrier;
    if (!this.clients.has(client)) return undefined;
    return this.plugin.addListener("stateChanged", listener);
  }

  async run(client: symbol, operation: (plugin: NativeAudioPlugin) => Promise<AudioStatus>): Promise<AudioStatus> {
    while (this.disposalBarrier) await this.disposalBarrier;
    if (!this.clients.has(client)) return disposedStatus();
    // Ordinary commands remain concurrent: a Stop must be able to cancel a
    // native Play that is still preparing files, rather than queue behind it.
    const state = await operation(this.plugin);
    return this.clients.has(client) ? state : disposedStatus();
  }

  async disposeIfUnused(): Promise<void> {
    // StrictMode cleanup and setup share a synchronous pass. Give the new owner
    // a chance to acquire before crossing the global native disposal boundary.
    await Promise.resolve();
    while (this.disposalBarrier) await this.disposalBarrier;
    if (this.clients.size > 0 || this.disposedGeneration === this.generation) return;
    const generation = this.generation;
    let finish!: () => void;
    const barrier = new Promise<void>((resolve) => { finish = resolve; });
    this.disposalBarrier = barrier;
    try {
      await this.plugin.dispose();
      this.disposedGeneration = generation;
    } finally {
      // A newly mounted client can exist now, but its bridge operations cannot
      // have run ahead of this in-flight global teardown.
      if (this.disposalBarrier === barrier) this.disposalBarrier = undefined;
      finish();
    }
  }
}

let nativeSession: NativeAudioSession | undefined;

/** The native bridge owns session/focus policy; UI never adjusts system volume. */
function createNativeMixer(): MixerEngine {
  const session = nativeSession ??= new NativeAudioSession();
  const client = session.acquire();
  const listeners = new Set<(status: AudioStatus) => void>();
  let disposed = false;
  let disposal: Promise<void> | undefined;
  const subscription = session.listen(client, (status) => {
    if (!disposed) listeners.forEach((listener) => {
      try { listener({ ...status }); } catch { /* One observer cannot break the bridge callback. */ }
    });
  });
  // Bridge failures are surfaced by setMix/getState, with no unhandled rejection.
  void subscription.catch(() => undefined);
  return {
    setMix: (mix) => session.run(client, (plugin) => plugin.setMix(mix)),
    getState: () => session.run(client, (plugin) => plugin.getState()),
    onStateChange(listener) {
      if (disposed) return () => undefined;
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    dispose() {
      if (disposal) return disposal;
      disposed = true;
      listeners.clear();
      session.release(client);
      const listenerCleanup = (async () => {
        // Registration may finish after unmount. Always remove this client's
        // handle; its late cleanup must not close another live client's mixer.
        const handle = await subscription.catch(() => undefined);
        try { await handle?.remove(); } catch { /* Continue shared resource cleanup even if listener removal fails. */ }
      })();
      // Slow listener registration must not keep an otherwise unowned mixer
      // playing. Its scoped cleanup and the shared ownership check are separate.
      disposal = Promise.all([listenerCleanup, session.disposeIfUnused()]).then(() => undefined);
      return disposal;
    },
  };
}

export function createMixerEngine(): MixerEngine {
  return Capacitor.isNativePlatform() ? createNativeMixer() : createWebMixer();
}
