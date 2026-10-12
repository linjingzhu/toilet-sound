import 'dart:async';
import 'dart:io';

import 'package:audio_session/audio_session.dart';
import 'package:just_audio/just_audio.dart';

import '../model/sound_track.dart';
import 'mixer_audio_engine.dart';

class VeilAudioEngine implements MixerAudioEngine {
  final Map<SoundTrackId, AudioPlayer> _players = {};
  final Map<SoundTrackId, double> _trackVolumes = {};
  final Set<SoundTrackId> _activeTracks = {};
  double _masterVolume = 0.72;

  @override
  Future<void> initialize(List<SoundTrack> tracks) async {
    final session = await AudioSession.instance;
    await session.configure(
      const AudioSessionConfiguration(
        avAudioSessionCategory: AVAudioSessionCategory.playback,
        avAudioSessionCategoryOptions:
            AVAudioSessionCategoryOptions.mixWithOthers,
        avAudioSessionMode: AVAudioSessionMode.defaultMode,
        avAudioSessionRouteSharingPolicy:
            AVAudioSessionRouteSharingPolicy.defaultPolicy,
        avAudioSessionSetActiveOptions: AVAudioSessionSetActiveOptions.none,
        androidAudioAttributes: AndroidAudioAttributes(
          contentType: AndroidAudioContentType.music,
          usage: AndroidAudioUsage.media,
        ),
        androidAudioFocusGainType: AndroidAudioFocusGainType.gain,
        androidWillPauseWhenDucked: false,
      ),
    );

    for (final track in tracks) {
      // Session activation is controlled here so Android playback does not
      // request audio focus and silence or duck the user's other app.
      final player = AudioPlayer(handleAudioSessionActivation: false);
      await player.setAsset(track.assetPath);
      await player.setLoopMode(LoopMode.one);
      _players[track.id] = player;
      _trackVolumes[track.id] = track.defaultVolume;
      await _applyVolume(track.id);
    }
  }

  @override
  Future<void> play(Set<SoundTrackId> activeTracks) async {
    _activeTracks
      ..clear()
      ..addAll(activeTracks);

    if (Platform.isIOS) {
      final session = await AudioSession.instance;
      await session.setActive(true);
    }

    for (final entry in _players.entries) {
      if (_activeTracks.contains(entry.key)) {
        unawaited(entry.value.play());
      } else {
        await entry.value.pause();
      }
    }
  }

  @override
  Future<void> pause() async {
    await Future.wait(_players.values.map((player) => player.pause()));
  }

  @override
  Future<void> setTrackActive(SoundTrackId id, bool active) async {
    if (active) {
      _activeTracks.add(id);
      final playback = _players[id]?.play();
      if (playback != null) unawaited(playback);
    } else {
      _activeTracks.remove(id);
      await _players[id]?.pause();
    }
  }

  @override
  Future<void> setTrackVolume(SoundTrackId id, double volume) async {
    _trackVolumes[id] = volume;
    await _applyVolume(id);
  }

  @override
  Future<void> setMasterVolume(double volume) async {
    _masterVolume = volume;
    await Future.wait(_players.keys.map(_applyVolume));
  }

  Future<void> _applyVolume(SoundTrackId id) async {
    final trackVolume = _trackVolumes[id] ?? 0;
    await _players[id]?.setVolume(trackVolume * _masterVolume);
  }

  @override
  Future<void> dispose() async {
    await Future.wait(_players.values.map((player) => player.dispose()));
    _players.clear();
  }
}
