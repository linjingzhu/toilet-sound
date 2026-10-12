import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PluginListenerHandle } from "@capacitor/core";
import type { AudioStatus, MixerEngine, MixerRequest } from "../src/audio/contracts";

const capacitor = vi.hoisted(() => ({ isNativePlatform: vi.fn(), registerPlugin: vi.fn() }));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: capacitor.isNativePlatform },
  registerPlugin: capacitor.registerPlugin,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const mix: MixerRequest = {
  playing: true, masterVolume: 0.7,
  tracks: [{ id: "water", file: "water.wav", volume: 0.65 }],
};
const status = (playing: boolean): AudioStatus => ({ playing, outputName: "테스트 출력" });

function mockPlugin() {
  const handles: { remove: ReturnType<typeof vi.fn<() => Promise<void>>> }[] = [];
  return {
    handles,
    setMix: vi.fn(async (request: MixerRequest): Promise<AudioStatus> => status(request.playing)),
    getState: vi.fn(async (): Promise<AudioStatus> => status(false)),
    dispose: vi.fn(async (): Promise<void> => undefined),
    addListener: vi.fn(async (_event: "stateChanged", _listener: (state: AudioStatus) => void): Promise<PluginListenerHandle> => {
      const handle = { remove: vi.fn(async (): Promise<void> => undefined) };
      handles.push(handle);
      return handle;
    }),
  };
}

let plugin: ReturnType<typeof mockPlugin>;
let factory: () => MixerEngine;
const clients: MixerEngine[] = [];
function createClient() { const client = factory(); clients.push(client); return client; }
async function flush() { for (let index = 0; index < 20; index++) await Promise.resolve(); }

beforeEach(async () => {
  vi.resetModules();
  capacitor.isNativePlatform.mockReset().mockReturnValue(true);
  capacitor.registerPlugin.mockReset();
  plugin = mockPlugin();
  capacitor.registerPlugin.mockReturnValue(plugin);
  factory = (await import("../src/veil/engine")).createMixerEngine;
});

afterEach(async () => {
  await Promise.allSettled(clients.splice(0).map((client) => client.dispose()));
});

describe("native mixer shared lifecycle", () => {
  it("lets a synchronous StrictMode remount retain playback before global teardown begins", async () => {
    const previous = createClient();
    await previous.setMix(mix);
    const cleanup = previous.dispose();
    const current = createClient();
    await cleanup;
    expect(plugin.dispose).not.toHaveBeenCalled();
    expect(capacitor.registerPlugin).toHaveBeenCalledTimes(1);
    expect(await current.setMix(mix)).toMatchObject({ playing: true });
    await current.dispose();
    expect(plugin.dispose).toHaveBeenCalledTimes(1);
  });

  it("removes a late old subscription without stopping a newer live client's mixer", async () => {
    const registration = deferred<PluginListenerHandle>();
    const removal = deferred<void>();
    const oldHandle = { remove: vi.fn(() => removal.promise) };
    plugin.addListener.mockReturnValueOnce(registration.promise);
    const previous = createClient();
    const oldObserver = vi.fn();
    previous.onStateChange(oldObserver);
    const cleanup = previous.dispose();

    const current = createClient();
    const currentObserver = vi.fn();
    current.onStateChange(currentObserver);
    await current.setMix(mix);
    registration.resolve(oldHandle);
    await flush();
    expect(oldHandle.remove).toHaveBeenCalledTimes(1);
    expect(plugin.dispose).not.toHaveBeenCalled();
    plugin.addListener.mock.calls[0][1](status(true));
    plugin.addListener.mock.calls[1][1](status(true));
    expect(oldObserver).not.toHaveBeenCalled();
    expect(currentObserver).toHaveBeenCalledTimes(1);

    removal.resolve();
    await cleanup;
    expect(plugin.dispose).not.toHaveBeenCalled();
    expect((await current.getState()).error).toBeUndefined();
    await current.dispose();
    expect(plugin.dispose).toHaveBeenCalledTimes(1);
    expect(plugin.handles[0].remove).toHaveBeenCalledTimes(1);
  });

  it("holds new play, state reads and listener registration behind an in-flight global dispose", async () => {
    const previous = createClient();
    await previous.setMix(mix);
    const teardown = deferred<void>();
    plugin.dispose.mockReturnValueOnce(teardown.promise);
    const cleanup = previous.dispose();
    await flush();
    expect(plugin.dispose).toHaveBeenCalledTimes(1);

    const current = createClient();
    const playing = current.setMix(mix);
    const reading = current.getState();
    await flush();
    expect(plugin.setMix).toHaveBeenCalledTimes(1);
    expect(plugin.getState).not.toHaveBeenCalled();
    expect(plugin.addListener).toHaveBeenCalledTimes(1);

    teardown.resolve();
    await cleanup;
    expect(await playing).toMatchObject({ playing: true });
    await reading;
    expect(plugin.setMix).toHaveBeenCalledTimes(2);
    expect(plugin.getState).toHaveBeenCalledTimes(1);
    expect(plugin.addListener).toHaveBeenCalledTimes(2);
    expect(plugin.dispose).toHaveBeenCalledTimes(1);
  });

  it("does not keep an unowned native mixer alive while an old listener registration is delayed", async () => {
    const registration = deferred<PluginListenerHandle>();
    const handle = { remove: vi.fn(async (): Promise<void> => undefined) };
    plugin.addListener.mockReturnValueOnce(registration.promise);
    const client = createClient();
    const cleanup = client.dispose();
    await flush();
    expect(plugin.dispose).toHaveBeenCalledTimes(1);
    expect(handle.remove).not.toHaveBeenCalled();
    registration.resolve(handle);
    await cleanup;
    expect(handle.remove).toHaveBeenCalledTimes(1);
    expect(plugin.dispose).toHaveBeenCalledTimes(1);
  });

  it("disposes only the released client's listener while another client remains live", async () => {
    const first = createClient();
    const second = createClient();
    const firstObserver = vi.fn();
    const secondObserver = vi.fn();
    first.onStateChange(firstObserver);
    second.onStateChange(secondObserver);
    await first.setMix(mix);
    await first.dispose();
    expect(plugin.dispose).not.toHaveBeenCalled();
    expect(plugin.handles[0].remove).toHaveBeenCalledTimes(1);
    expect(plugin.handles[1].remove).not.toHaveBeenCalled();
    plugin.addListener.mock.calls[0][1](status(true));
    plugin.addListener.mock.calls[1][1](status(true));
    expect(firstObserver).not.toHaveBeenCalled();
    expect(secondObserver).toHaveBeenCalledTimes(1);
    await second.setMix({ ...mix, playing: false });
    await second.dispose();
    expect(plugin.handles[1].remove).toHaveBeenCalledTimes(1);
    expect(plugin.dispose).toHaveBeenCalledTimes(1);
  });

  it("never sends commands or registers observers from an already disposed client", async () => {
    const client = createClient();
    const cleanup = client.dispose();
    expect(client.dispose()).toBe(cleanup);
    await cleanup;
    expect(await client.setMix(mix)).toMatchObject({ playing: false, error: expect.any(String) });
    expect(await client.getState()).toMatchObject({ playing: false, error: expect.any(String) });
    const observer = vi.fn();
    client.onStateChange(observer);
    plugin.addListener.mock.calls[0][1](status(true));
    expect(observer).not.toHaveBeenCalled();
    expect(plugin.setMix).not.toHaveBeenCalled();
    expect(plugin.getState).not.toHaveBeenCalled();
    expect(plugin.dispose).toHaveBeenCalledTimes(1);
    expect(plugin.handles[0].remove).toHaveBeenCalledTimes(1);
  });

  it("rechecks liveness for a new client disposed while waiting behind global teardown", async () => {
    const previous = createClient();
    const teardown = deferred<void>();
    plugin.dispose.mockReturnValueOnce(teardown.promise);
    const oldCleanup = previous.dispose();
    await flush();
    const abandoned = createClient();
    const waiting = abandoned.setMix(mix);
    const abandonedCleanup = abandoned.dispose();
    teardown.resolve();
    await Promise.all([oldCleanup, abandonedCleanup]);
    expect(await waiting).toMatchObject({ playing: false, error: expect.any(String) });
    expect(plugin.setMix).not.toHaveBeenCalled();
    expect(plugin.addListener).toHaveBeenCalledTimes(1);
  });

  it("still forwards Stop while an earlier native Play is preparing files", async () => {
    const preparing = deferred<AudioStatus>();
    plugin.setMix.mockImplementation((request) => request.playing ? preparing.promise : Promise.resolve(status(false)));
    const client = createClient();
    const playing = client.setMix(mix);
    const stopping = client.setMix({ ...mix, playing: false });
    expect(plugin.setMix).toHaveBeenCalledTimes(2);
    expect(await stopping).toMatchObject({ playing: false });
    preparing.resolve(status(false));
    await playing;
  });

  it("does not return a live playback state to a client disposed during its native request", async () => {
    const preparing = deferred<AudioStatus>();
    plugin.setMix.mockReturnValueOnce(preparing.promise);
    const client = createClient();
    const playing = client.setMix(mix);
    await client.dispose();
    preparing.resolve(status(true));
    expect(await playing).toMatchObject({ playing: false, error: expect.any(String) });
  });

  it("releases the lifecycle barrier on native disposal failure so the next client can retry", async () => {
    const previous = createClient();
    const teardown = deferred<void>();
    plugin.dispose.mockReturnValueOnce(teardown.promise);
    const cleanup = previous.dispose();
    const observedFailure = expect(cleanup).rejects.toThrow("native teardown failed");
    await flush();
    const current = createClient();
    const playing = current.setMix(mix);
    expect(plugin.setMix).not.toHaveBeenCalled();
    teardown.reject(new Error("native teardown failed"));
    await observedFailure;
    expect(await playing).toMatchObject({ playing: true });
    expect(plugin.setMix).toHaveBeenCalledTimes(1);
  });
});
