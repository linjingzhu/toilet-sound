export type SoundCategory = "nature" | "noise" | "piano";

export interface SoundDefinition {
  id: string;
  label: string;
  category: SoundCategory;
  file: string;
  description: string;
}

export interface AudioTrack {
  id: string;
  file: string;
  volume: number;
}

export interface MixerRequest {
  playing: boolean;
  masterVolume: number;
  tracks: AudioTrack[];
}

export interface AudioStatus {
  playing: boolean;
  outputName: string;
  interrupted?: boolean;
  error?: string;
}

export interface MixerEngine {
  setMix(mix: MixerRequest): Promise<AudioStatus>;
  getState(): Promise<AudioStatus>;
  onStateChange(listener: (state: AudioStatus) => void): () => void;
  dispose(): Promise<void>;
}
