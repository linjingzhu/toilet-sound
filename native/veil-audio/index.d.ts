import type { PluginListenerHandle } from '@capacitor/core';

export interface AudioTrack {
  id: string;
  /** Safe basename in the bundled public/app/audio directory. */
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

export interface VeilAudioPlugin {
  setMix(request: MixerRequest): Promise<AudioStatus>;
  getState(): Promise<AudioStatus>;
  dispose(): Promise<void>;
  addListener(
    eventName: 'stateChanged',
    listener: (status: AudioStatus) => void,
  ): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}

export declare const VeilAudio: VeilAudioPlugin;
