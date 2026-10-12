#!/usr/bin/env python3
"""Generate VEIL's original synthetic demo loops; imports no recordings or music.

Run from the repository root:
    python scripts/generate_demo_audio.py --output-dir app/public/app/audio

Only NumPy and Python's standard library are required. Output is deterministic
for the recorded NumPy version/seed algorithm. See docs/audio-assets.md.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import sys
import wave

import numpy as np


SAMPLE_RATE = 22_050
DURATION_SECONDS = 16
SAMPLE_COUNT = SAMPLE_RATE * DURATION_SECONDS
PEAK_LIMIT = 0.075
SEED_NAMESPACE = "veil-original-synthetic-demo-v1"
ROOT = Path(__file__).resolve().parents[1]
TIME = np.arange(SAMPLE_COUNT, dtype=np.float64) / SAMPLE_RATE

CATALOG = (
    ("water", "nature", "Broad, steady synthetic water with soft bubbles"),
    ("stream", "nature", "Light synthetic trickle with distinct bubbling droplets"),
    ("rain", "nature", "Bright synthetic rain bed with scattered soft droplets"),
    ("ocean", "nature", "Two slow synthetic surf swells and a bright foam layer"),
    ("birds", "nature", "Sparse, frequency-modulated synthetic bird chirps"),
    ("wind", "nature", "Low synthetic wind gusts and a faint moving whistle"),
    ("fan", "noise", "Steady synthetic ventilation with quiet motor harmonics"),
    ("white-noise", "noise", "Band-limited white noise"),
    ("pink-noise", "noise", "Band-limited noise with approximately 1/f power"),
    ("brown-noise", "noise", "Band-limited noise with approximately 1/f^2 power"),
    ("piano-calm", "piano", "Original calm major-key arpeggio, synthesized piano-like timbre"),
    ("piano-warm", "piano", "Original warm arpeggio, synthesized piano-like timbre"),
    ("piano-night", "piano", "Original low-register minor arpeggio, synthesized piano-like timbre"),
)


def random_source(sound_id: str) -> np.random.Generator:
    digest = hashlib.sha256(f"{SEED_NAMESPACE}/{sound_id}".encode()).digest()
    return np.random.default_rng(int.from_bytes(digest[:8], "little"))


def unit_rms(signal: np.ndarray) -> np.ndarray:
    return signal / max(float(np.sqrt(np.mean(signal * signal))), 1e-12)


def colored_noise(
    rng: np.random.Generator,
    power_slope: float = 0.0,
    low_hz: float = 35.0,
    high_hz: float = 8_500.0,
) -> np.ndarray:
    """A whole-period FFT filter, with no filter startup/tail at the loop join."""
    spectrum = np.fft.rfft(rng.standard_normal(SAMPLE_COUNT))
    frequencies = np.fft.rfftfreq(SAMPLE_COUNT, 1 / SAMPLE_RATE)
    safe_frequencies = np.maximum(frequencies, 1.0)
    color = (safe_frequencies / 1_000.0) ** (-power_slope / 2)
    high_pass = 1 / np.sqrt(1 + (low_hz / safe_frequencies) ** 8)
    low_pass = 1 / np.sqrt(1 + (safe_frequencies / high_hz) ** 8)
    spectrum *= color * high_pass * low_pass
    spectrum[0] = 0
    return unit_rms(np.fft.irfft(spectrum, n=SAMPLE_COUNT))


def periodic_tone(frequency: float, modulation_cycles: int = 0) -> np.ndarray:
    cycles = round(frequency * DURATION_SECONDS)
    phase = 2 * np.pi * cycles * TIME / DURATION_SECONDS
    if modulation_cycles:
        phase += 0.8 * np.sin(2 * np.pi * modulation_cycles * TIME / DURATION_SECONDS)
    return np.sin(phase)


def add_event(signal: np.ndarray, start_seconds: float, event: np.ndarray, level: float = 1.0) -> None:
    """Wrap note/droplet tails into the next period instead of truncating them."""
    indices = (round(start_seconds * SAMPLE_RATE) + np.arange(len(event))) % SAMPLE_COUNT
    np.add.at(signal, indices, event * level)


def bubble(frequency: float, duration: float, rng: np.random.Generator) -> np.ndarray:
    time = np.arange(round(duration * SAMPLE_RATE)) / SAMPLE_RATE
    phase = 2 * np.pi * frequency * (time + 0.24 * duration * (1 - np.exp(-time / duration)))
    envelope = (1 - np.exp(-time / 0.004)) * np.exp(-time / (duration * 0.19))
    envelope *= np.sin(np.pi * np.minimum(time / duration, 1)) ** 0.4
    return envelope * (np.sin(phase) + 0.15 * rng.standard_normal(len(time)))


def nature_loop(sound_id: str, rng: np.random.Generator) -> np.ndarray:
    cycle = 2 * np.pi * TIME / DURATION_SECONDS
    if sound_id == "water":
        signal = colored_noise(rng, 0.45, 150, 6_500) * (0.85 + 0.07 * np.sin(2 * cycle) + 0.05 * np.sin(5 * cycle))
        signal += 0.24 * colored_noise(rng, 1.1, 75, 1_200)
        for onset in np.arange(0.1, DURATION_SECONDS, 0.65):
            add_event(signal, float(onset), bubble(float(rng.uniform(320, 850)), 0.22, rng), 0.5)
        return signal
    if sound_id == "stream":
        signal = 0.42 * colored_noise(rng, 0.7, 280, 4_700)
        signal *= 0.8 + 0.17 * np.sin(3 * cycle) + 0.09 * np.sin(7 * cycle)
        for _ in range(85):
            add_event(signal, float(rng.uniform(0, DURATION_SECONDS)), bubble(float(rng.uniform(600, 1_900)), float(rng.uniform(0.08, 0.25)), rng), float(rng.uniform(0.8, 1.5)))
        return signal
    if sound_id == "rain":
        signal = colored_noise(rng, 0.0, 900, 7_400) + 0.3 * colored_noise(rng, 0.5, 200, 3_000)
        signal *= 0.91 + 0.06 * np.cos(3 * cycle)
        for _ in range(140):
            duration = float(rng.uniform(0.025, 0.065))
            time = np.arange(round(duration * SAMPLE_RATE)) / SAMPLE_RATE
            envelope = np.sin(np.pi * time / duration) ** 2 * np.exp(-time / (duration * 0.25))
            add_event(signal, float(rng.uniform(0, DURATION_SECONDS)), rng.standard_normal(len(time)) * envelope, 2.0)
        return signal
    if sound_id == "ocean":
        swell = (0.5 + 0.5 * np.sin(2 * cycle - 0.9)) ** 1.8
        signal = colored_noise(rng, 1.2, 45, 2_800) * (0.2 + 0.8 * swell)
        signal += 0.45 * colored_noise(rng, 0.15, 700, 6_500) * swell**2
        return signal
    if sound_id == "birds":
        signal = 0.018 * colored_noise(rng, 1.5, 250, 3_000)
        for cluster, onset in enumerate((0.7, 2.8, 5.6, 8.7, 11.2, 14.5)):
            for note in range(2 + cluster % 2):
                duration = float(rng.uniform(0.10, 0.22))
                time = np.arange(round(duration * SAMPLE_RATE)) / SAMPLE_RATE
                frequency = rng.uniform(2_000, 3_300) + rng.uniform(550, 1_250) * np.sin(np.pi * time / duration)
                phase = 2 * np.pi * np.cumsum(frequency) / SAMPLE_RATE
                envelope = np.sin(np.pi * time / duration) ** 2
                chirp = envelope * (np.sin(phase) + 0.1 * np.sin(2 * phase))
                add_event(signal, onset + note * 0.26, chirp, float(rng.uniform(0.6, 0.95)))
        return signal
    if sound_id == "wind":
        gust = 0.56 + 0.21 * np.sin(3 * cycle + 0.5) + 0.13 * np.sin(5 * cycle)
        signal = colored_noise(rng, 1.5, 45, 1_500) * gust
        signal += 0.07 * periodic_tone(343, 3) * (0.5 + 0.5 * np.sin(3 * cycle))
        return signal
    if sound_id == "fan":
        signal = 0.8 * colored_noise(rng, 0.9, 75, 2_600)
        signal *= 0.96 + 0.04 * np.sin(2 * np.pi * 23 * TIME)
        for frequency, level in ((60, 0.12), (120, 0.17), (180, 0.075), (300, 0.04)):
            signal += level * periodic_tone(frequency)
        return signal
    if sound_id == "white-noise":
        return colored_noise(rng, 0.0, 35, 8_500)
    if sound_id == "pink-noise":
        return colored_noise(rng, 1.0, 35, 8_000)
    if sound_id == "brown-noise":
        return colored_noise(rng, 2.0, 35, 4_500)
    raise ValueError(f"Unknown environment: {sound_id}")


def piano_note(midi: int, velocity: float, rng: np.random.Generator) -> np.ndarray:
    duration = 4.6
    time = np.arange(round(duration * SAMPLE_RATE)) / SAMPLE_RATE
    fundamental = 440 * 2 ** ((midi - 69) / 12)
    tone = np.zeros_like(time)
    for partial, strength in enumerate((1.0, 0.43, 0.20, 0.12, 0.055, 0.027), start=1):
        frequency = fundamental * partial * math.sqrt(1 + 0.00012 * partial * partial)
        decay = np.exp(-time * (0.65 + 0.24 * partial + max(midi - 60, 0) * 0.017))
        tone += strength * np.sin(2 * np.pi * frequency * time) * decay
    attack = 1 - np.exp(-time / 0.004)
    release = np.minimum((duration - time) / 0.2, 1).clip(0, 1)
    release = np.sin(release * np.pi / 2) ** 2
    hammer = rng.standard_normal(len(time)) * np.exp(-time / 0.006) * 0.018
    return velocity * (tone + hammer) * attack * release


def piano_loop(sound_id: str, rng: np.random.Generator) -> np.ndarray:
    """Original algorithmic note schedules; no existing composition is sampled."""
    progressions = {
        "piano-calm": ((48, 60, 64, 67), (45, 57, 60, 64), (41, 53, 57, 60), (43, 55, 59, 62)),
        "piano-warm": ((50, 57, 62, 66), (47, 54, 59, 62), (43, 55, 59, 62), (45, 57, 61, 64)),
        "piano-night": ((45, 52, 57, 60), (41, 48, 53, 57), (48, 55, 60, 64), (43, 50, 55, 59)),
    }
    signal = np.zeros(SAMPLE_COUNT)
    for bar, chord in enumerate(progressions[sound_id]):
        add_event(signal, bar * 4.0, piano_note(chord[0], 0.64, rng))
        offsets = (0.20, 1.25, 2.30, 3.25) if sound_id != "piano-warm" else (0.15, 0.90, 1.70, 2.45, 3.20)
        pattern = (1, 2, 3, 2, 3)
        for index, offset in enumerate(offsets):
            midi = chord[pattern[index]]
            if sound_id == "piano-calm" and index == 2:
                midi += 12
            add_event(signal, bar * 4 + offset, piano_note(midi, 0.49 + 0.05 * (index % 2), rng))
    # A small, circular synthetic room tail avoids abruptly cut reverb at joins.
    dry = signal.copy()
    for delay, level in ((0.073, 0.13), (0.149, 0.095), (0.231, 0.06), (0.401, 0.035)):
        signal += level * np.roll(dry, round(delay * SAMPLE_RATE))
    return signal


def finish_loop(signal: np.ndarray) -> np.ndarray:
    signal = np.asarray(signal, dtype=np.float64).copy()
    if signal.shape != (SAMPLE_COUNT,) or not np.isfinite(signal).all():
        raise ValueError("Invalid synthesized waveform")
    # Match the two boundary samples with a gentle local correction. This leaves
    # continuous noise energy at the join; there is no fade-to-silence loop gap.
    seam_samples = round(0.006 * SAMPLE_RATE)
    weight = (0.5 + 0.5 * np.cos(np.linspace(0, np.pi, seam_samples))) ** 2
    midpoint = (signal[0] + signal[-1]) / 2
    signal[:seam_samples] += (midpoint - signal[0]) * weight
    signal[-seam_samples:] += (midpoint - signal[-1]) * weight[::-1]
    signal -= np.mean(signal)
    signal *= PEAK_LIMIT / max(float(np.max(np.abs(signal))), 1e-12)
    # Explicit little-endian signed PCM, including on big-endian Python hosts.
    return np.rint(signal * 32_767).astype("<i2")


def inspect_pcm(pcm: np.ndarray) -> dict[str, float | int]:
    values = pcm.astype(np.float64) / 32_768
    peak = float(np.max(np.abs(values)))
    rms = float(np.sqrt(np.mean(values * values)))
    seam_jump = int(abs(int(pcm[0]) - int(pcm[-1])))
    if len(pcm) != SAMPLE_COUNT or peak > PEAK_LIMIT + 1 / 32_768 or rms < 0.001 or seam_jump > 1:
        raise ValueError(f"Waveform failed validation: peak={peak}, rms={rms}, seam={seam_jump}")
    return {
        "sample_count": len(pcm),
        "peak": round(peak, 8),
        "rms_dbfs": round(20 * math.log10(rms), 3),
        "seam_jump_pcm": seam_jump,
    }


def generate(output: Path) -> None:
    output.mkdir(parents=True, exist_ok=True)
    entries = []
    for sound_id, category, description in CATALOG:
        rng = random_source(sound_id)
        signal = piano_loop(sound_id, rng) if category == "piano" else nature_loop(sound_id, rng)
        pcm = finish_loop(signal)
        metrics = inspect_pcm(pcm)
        path = output / f"{sound_id}.wav"
        with wave.open(str(path), "wb") as audio:
            audio.setnchannels(1)
            audio.setsampwidth(2)
            audio.setframerate(SAMPLE_RATE)
            audio.writeframes(pcm.tobytes())
        entry = {
            "id": sound_id, "category": category, "file": path.name,
            "description": description, "duration_seconds": DURATION_SECONDS,
            "sample_rate": SAMPLE_RATE, "channels": 1, "bits_per_sample": 16,
            **metrics, "bytes": path.stat().st_size,
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        }
        entries.append(entry)
        print(f"{path.name}: {DURATION_SECONDS}s, peak {metrics['peak']:.4f}, RMS {metrics['rms_dbfs']:.1f} dBFS, seam {metrics['seam_jump_pcm']} PCM")
    if len({entry["sha256"] for entry in entries}) != len(CATALOG):
        raise ValueError("Two catalog files unexpectedly have identical content")
    manifest = {
        "schema_version": 1,
        "title": "VEIL original synthetic demo audio",
        "creator": "VEIL project, synthesized with an OpenAI coding assistant",
        "source": "scripts/generate_demo_audio.py",
        "seed_namespace": SEED_NAMESPACE,
        "numpy_version": np.__version__,
        "sample_rate": SAMPLE_RATE,
        "duration_seconds": DURATION_SECONDS,
        "peak_limit": PEAK_LIMIT,
        "imported_recordings": False,
        "rights_note": "Original procedural demo assets; no third-party recordings, samples, or compositions imported. See docs/audio-assets.md.",
        "tracks": entries,
    }
    (output / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(entries)} WAV loops and manifest.json to {output}")


def verify(output: Path) -> None:
    manifest = json.loads((output / "manifest.json").read_text(encoding="utf-8"))
    entries = {entry["id"]: entry for entry in manifest["tracks"]}
    if set(entries) != {item[0] for item in CATALOG}:
        raise ValueError("Manifest does not match the source catalog")
    for sound_id, _, _ in CATALOG:
        path = output / f"{sound_id}.wav"
        with wave.open(str(path), "rb") as audio:
            if (audio.getnchannels(), audio.getsampwidth(), audio.getframerate(), audio.getnframes()) != (1, 2, SAMPLE_RATE, SAMPLE_COUNT):
                raise ValueError(f"Incorrect WAV format: {path.name}")
            pcm = np.frombuffer(audio.readframes(SAMPLE_COUNT), dtype="<i2")
        inspect_pcm(pcm)
        if hashlib.sha256(path.read_bytes()).hexdigest() != entries[sound_id]["sha256"]:
            raise ValueError(f"Manifest hash mismatch: {path.name}")
    print(f"Verified {len(entries)} distinct, finite, mono PCM loops and manifest hashes in {output}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=ROOT / "app/public/app/audio")
    parser.add_argument("--verify-only", action="store_true", help="Check existing files without generating or changing them")
    arguments = parser.parse_args()
    if arguments.verify_only:
        verify(arguments.output_dir)
    else:
        generate(arguments.output_dir)
        verify(arguments.output_dir)
    return 0


if __name__ == "__main__":
    sys.exit(main())
