import 'package:flutter_test/flutter_test.dart';
import 'package:veil/src/audio/mixer_audio_engine.dart';
import 'package:veil/src/mixer/mixer_controller.dart';
import 'package:veil/src/model/sound_track.dart';
import 'package:veil/src/persistence/mixer_preferences.dart';

void main() {
  group('MixerController', () {
    late FakeAudioEngine engine;
    late MemoryMixerPreferences preferences;
    late MixerController controller;

    setUp(() async {
      engine = FakeAudioEngine();
      preferences = MemoryMixerPreferences();
      controller = MixerController(engine, preferences);
      await controller.initialize();
    });

    tearDown(() => controller.dispose());

    test('starts stopped with the default three-track mix', () {
      expect(controller.isPlaying, isFalse);
      expect(
        controller.selectedTracks,
        containsAll([
          SoundTrackId.flowingWater,
          SoundTrackId.birds,
          SoundTrackId.calmPiano,
        ]),
      );
      expect(engine.playCalls, isEmpty);
    });

    test('play starts only the selected tracks', () async {
      await controller.togglePlayback();

      expect(controller.isPlaying, isTrue);
      expect(engine.playCalls.single, controller.selectedTracks);
    });

    test(
      'changing music keeps ambience selected and swaps one music track',
      () async {
        await controller.togglePlayback();
        await controller.changeMusic();

        expect(controller.isSelected(SoundTrackId.flowingWater), isTrue);
        expect(controller.isSelected(SoundTrackId.birds), isTrue);
        expect(controller.isSelected(SoundTrackId.calmPiano), isFalse);
        expect(controller.isSelected(SoundTrackId.dawnPiano), isTrue);
        expect(engine.activeChanges, [
          (SoundTrackId.calmPiano, false),
          (SoundTrackId.dawnPiano, true),
        ]);
      },
    );

    test(
      'master volume is internal to the audio engine and persisted',
      () async {
        await controller.setMasterVolume(0.41);

        expect(engine.masterVolume, 0.41);
        expect(preferences.snapshot?.masterVolume, 0.41);
      },
    );
  });
}

class FakeAudioEngine implements MixerAudioEngine {
  final List<Set<SoundTrackId>> playCalls = [];
  final List<(SoundTrackId, bool)> activeChanges = [];
  double masterVolume = 0;

  @override
  Future<void> initialize(List<SoundTrack> tracks) async {}

  @override
  Future<void> pause() async {}

  @override
  Future<void> play(Set<SoundTrackId> activeTracks) async {
    playCalls.add(Set.of(activeTracks));
  }

  @override
  Future<void> setMasterVolume(double volume) async {
    masterVolume = volume;
  }

  @override
  Future<void> setTrackActive(SoundTrackId id, bool active) async {
    activeChanges.add((id, active));
  }

  @override
  Future<void> setTrackVolume(SoundTrackId id, double volume) async {}

  @override
  Future<void> dispose() async {}
}

class MemoryMixerPreferences implements MixerPreferences {
  MixerSnapshot? snapshot;

  @override
  Future<MixerSnapshot?> load() async => snapshot;

  @override
  Future<void> save(MixerSnapshot snapshot) async {
    this.snapshot = snapshot;
  }
}
