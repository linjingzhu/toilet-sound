import '../model/sound_track.dart';

abstract interface class MixerAudioEngine {
  Future<void> initialize(List<SoundTrack> tracks);

  Future<void> play(Set<SoundTrackId> activeTracks);

  Future<void> pause();

  Future<void> setTrackActive(SoundTrackId id, bool active);

  Future<void> setTrackVolume(SoundTrackId id, double volume);

  Future<void> setMasterVolume(double volume);

  Future<void> dispose();
}
