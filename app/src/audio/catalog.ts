import type { MixerRequest, SoundDefinition } from "./contracts";

/** Original, synthetic demo loops. See docs/audio-assets.md before release. */
export const SOUND_CATALOG: readonly SoundDefinition[] = [
  { id: "water", label: "흐르는 물", category: "nature", file: "water.wav", description: "부드럽고 일정한 물줄기" },
  { id: "stream", label: "시냇물", category: "nature", file: "stream.wav", description: "작은 물방울이 흐르는 시냇가" },
  { id: "rain", label: "비", category: "nature", file: "rain.wav", description: "고르게 내리는 잔잔한 빗소리" },
  { id: "ocean", label: "파도", category: "nature", file: "ocean.wav", description: "천천히 밀려오고 물러나는 파도" },
  { id: "birds", label: "새소리", category: "nature", file: "birds.wav", description: "여백 사이로 들리는 가벼운 지저귐" },
  { id: "wind", label: "바람", category: "nature", file: "wind.wav", description: "나뭇잎 사이를 지나는 낮은 바람" },
  { id: "fan", label: "환풍기", category: "noise", file: "fan.wav", description: "일정하게 이어지는 환기음" },
  { id: "white-noise", label: "화이트 노이즈", category: "noise", file: "white-noise.wav", description: "밝고 고른 소리의 질감" },
  { id: "pink-noise", label: "핑크 노이즈", category: "noise", file: "pink-noise.wav", description: "중저음이 편안하게 채워지는 질감" },
  { id: "brown-noise", label: "브라운 노이즈", category: "noise", file: "brown-noise.wav", description: "더 깊고 부드러운 저음의 질감" },
  { id: "piano-calm", label: "차분한 피아노", category: "piano", file: "piano-calm.wav", description: "천천히 펼쳐지는 밝은 피아노풍 선율" },
  { id: "piano-warm", label: "따뜻한 오후", category: "piano", file: "piano-warm.wav", description: "포근한 화음의 피아노풍 선율" },
  { id: "piano-night", label: "밤의 여백", category: "piano", file: "piano-night.wav", description: "낮은 음역의 차분한 피아노풍 선율" },
];

export const DEFAULT_MIX: MixerRequest = {
  playing: false,
  masterVolume: 0.7,
  tracks: [
    { id: "water", file: "water.wav", volume: 0.65 },
    { id: "birds", file: "birds.wav", volume: 0.2 },
    { id: "piano-calm", file: "piano-calm.wav", volume: 0.35 },
  ],
};

export function getSound(id: string): SoundDefinition | undefined {
  return SOUND_CATALOG.find((sound) => sound.id === id);
}
