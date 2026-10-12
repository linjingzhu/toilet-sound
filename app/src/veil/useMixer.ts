import { useCallback, useEffect, useRef, useState } from "react";
import { MIX_STORAGE_KEY, restoreMix, sanitizeMix, serializeMix } from "../audio";
import type { AudioStatus, MixerEngine, MixerRequest } from "../audio/contracts";
import { createMixerEngine } from "./engine";

function loadSavedMix(): MixerRequest {
  try { return restoreMix(localStorage.getItem(MIX_STORAGE_KEY)); }
  catch { return restoreMix(null); }
}

export function useMixer() {
  const [mix, setMix] = useState(loadSavedMix);
  const [status, setStatus] = useState<AudioStatus>({ playing: false, outputName: "기본 출력" });
  const [busy, setBusy] = useState(false);
  const mixRef = useRef(mix);
  const engineRef = useRef<MixerEngine | null>(null);
  const mounted = useRef(false);
  const revision = useRef(0);
  const pending = useRef(false);

  const save = useCallback((next: MixerRequest) => {
    mixRef.current = next;
    setMix(next);
    try { localStorage.setItem(MIX_STORAGE_KEY, serializeMix(next)); }
    catch { /* Playback remains usable if browser storage is unavailable. */ }
  }, []);

  const apply = useCallback((next: MixerRequest) => {
    const request = sanitizeMix(next);
    save(request);
    const engine = engineRef.current;
    if (!engine) return;
    const operation = ++revision.current;
    pending.current = true;
    setBusy(true);
    // Called synchronously from the control event, preserving audio user activation.
    void engine.setMix(request).then((actual) => {
      if (!mounted.current || operation !== revision.current) return;
      pending.current = false;
      setBusy(false);
      const reconciled = { ...mixRef.current, playing: actual.playing };
      save(reconciled);
      if (request.playing && !actual.playing) {
        // A failed start must not leave a latent playback intent in the engine.
        // Keep the reported error visible after synchronously cancelling work.
        void engine.setMix(reconciled).catch(() => undefined);
      }
      setStatus(actual);
    }).catch(() => {
      if (!mounted.current || operation !== revision.current) return;
      pending.current = false;
      setBusy(false);
      const stopped = { ...mixRef.current, playing: false };
      save(stopped);
      void engine.setMix(stopped).catch(() => undefined);
      setStatus((current) => ({ ...current, playing: false, error: "소리를 준비하지 못했어요. 다시 재생해 주세요." }));
    });
  }, [save]);

  useEffect(() => {
    mounted.current = true;
    const engine = createMixerEngine();
    engineRef.current = engine;
    let active = true;
    const off = engine.onStateChange((actual) => {
      if (!active) return;
      setStatus(actual);
      if (actual.interrupted && (mixRef.current.playing || pending.current)) {
        // Cancel every outstanding UI intent and explicitly stop queued playback.
        // Sticky interruption events from that stop do not recurse.
        ++revision.current;
        pending.current = false;
        setBusy(false);
        const stopped = { ...mixRef.current, playing: false };
        save(stopped);
        void engine.setMix(stopped).catch(() => undefined);
      }
    });
    const initialRevision = revision.current;
    // A fresh view always restores stopped. This also cancels an orphaned Play
    // from a view destroyed while the native bridge was still preparing it.
    const stoppedBaseline = { ...mixRef.current, playing: false };
    save(stoppedBaseline);
    void engine.setMix(stoppedBaseline).then((actual) => {
      if (active && revision.current === initialRevision) {
        setStatus(actual);
      }
    }).catch(() => {
      if (active && revision.current === initialRevision) {
        setStatus({ playing: false, outputName: "기본 출력", error: "오디오를 연결하지 못했어요. 다시 재생해 주세요." });
      }
    });
    return () => {
      active = false;
      mounted.current = false;
      ++revision.current;
      off();
      engineRef.current = null;
      void engine.dispose().catch(() => undefined);
    };
  }, [save]);

  const update = useCallback((change: (current: MixerRequest) => MixerRequest) => {
    apply(change(mixRef.current));
  }, [apply]);

  return { mix, status, busy, update };
}
